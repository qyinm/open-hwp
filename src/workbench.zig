const std = @import("std");

const utils = @import("utils.zig");
const xml_tools = @import("xml_tools.zig");

pub const WorkbenchError = error{
    InvalidSessionSchema,
    MissingSectionInSession,
    UnknownSectionInSession,
};

pub const WorkbenchNode = xml_tools.RunTextValue;

pub const WorkbenchSection = struct {
    path: []const u8,
    nodes: []WorkbenchNode,
};

pub const WorkbenchSession = struct {
    schema: []const u8,
    source_document: []const u8,
    sections: []WorkbenchSection,
};

const session_schema = "openhwp-workbench-v1";

fn tempDir(allocator: std.mem.Allocator) ![]u8 {
    return try utils.runCommand(allocator, &.{ "mktemp", "-d" }, null);
}

fn hasXmlExt(name: []const u8) bool {
    if (name.len < 4) return false;
    return std.ascii.eqlIgnoreCase(name[name.len - 4 ..], ".xml");
}

fn isSectionDocumentPath(path: []const u8) bool {
    if (!std.mem.startsWith(u8, path, "Contents/")) return false;
    const basename = std.fs.path.basename(path);
    if (!hasXmlExt(basename)) return false;
    return std.mem.startsWith(u8, basename, "section");
}

fn sortPaths(paths: [][]u8) void {
    var i: usize = 1;
    while (i < paths.len) : (i += 1) {
        var j = i;
        while (j > 0 and std.mem.order(u8, paths[j], paths[j - 1]) == .lt) : (j -= 1) {
            const tmp = paths[j];
            paths[j] = paths[j - 1];
            paths[j - 1] = tmp;
        }
    }
}

fn collectSectionPaths(dir: std.fs.Dir, allocator: std.mem.Allocator) !std.ArrayList([]u8) {
    var paths = std.ArrayList([]u8).empty;
    errdefer {
        for (paths.items) |path| allocator.free(path);
        paths.deinit(allocator);
    }

    var walker = try dir.walk(allocator);
    defer walker.deinit();

    while (try walker.next()) |entry| {
        if (entry.kind != .file) continue;
        if (!isSectionDocumentPath(entry.path)) continue;
        try paths.append(allocator, try allocator.dupe(u8, entry.path));
    }
    sortPaths(paths.items);
    return paths;
}

fn freeCollectedSession(allocator: std.mem.Allocator, session: WorkbenchSession) void {
    for (session.sections) |section| {
        allocator.free(section.path);
        xml_tools.freeRunTextValues(allocator, section.nodes);
    }
    allocator.free(session.sections);
    allocator.free(session.source_document);
}

fn collectSessionFromDir(
    allocator: std.mem.Allocator,
    dir: std.fs.Dir,
    source_document: []const u8,
) !WorkbenchSession {
    var section_paths = try collectSectionPaths(dir, allocator);
    defer {
        for (section_paths.items) |path| allocator.free(path);
        section_paths.deinit(allocator);
    }

    var sections = std.ArrayList(WorkbenchSection).empty;
    errdefer {
        for (sections.items) |section| {
            allocator.free(section.path);
            xml_tools.freeRunTextValues(allocator, section.nodes);
        }
        sections.deinit(allocator);
    }

    for (section_paths.items) |path| {
        const xml_data = try dir.readFileAlloc(allocator, path, 64 * 1024 * 1024);
        defer allocator.free(xml_data);

        const nodes = try xml_tools.collectRunTextValues(allocator, xml_data);
        errdefer xml_tools.freeRunTextValues(allocator, nodes);

        try sections.append(allocator, .{
            .path = try allocator.dupe(u8, path),
            .nodes = nodes,
        });
    }

    return .{
        .schema = session_schema,
        .source_document = try allocator.dupe(u8, source_document),
        .sections = try sections.toOwnedSlice(allocator),
    };
}

fn findSectionIndex(sections: []const WorkbenchSection, path: []const u8) ?usize {
    for (sections, 0..) |section, idx| {
        if (std.mem.eql(u8, section.path, path)) return idx;
    }
    return null;
}

fn readFileAbsoluteAlloc(allocator: std.mem.Allocator, abs_path: []const u8, max_bytes: usize) ![]u8 {
    const file = try std.fs.openFileAbsolute(abs_path, .{});
    defer file.close();
    return try file.readToEndAlloc(allocator, max_bytes);
}

fn writeFileAbsolute(abs_path: []const u8, bytes: []const u8) !void {
    const file = try std.fs.createFileAbsolute(abs_path, .{ .truncate = true });
    defer file.close();
    try file.writeAll(bytes);
}

pub fn exportSessionJson(
    allocator: std.mem.Allocator,
    input_path: []const u8,
    output_json_path: []const u8,
) !void {
    const absolute_output = try utils.resolveAbsolutePath(allocator, output_json_path);
    defer allocator.free(absolute_output);

    const tmp_dir_alloc = try tempDir(allocator);
    const tmp_dir = std.mem.trim(u8, tmp_dir_alloc, "\r\n");
    defer allocator.free(tmp_dir_alloc);

    try utils.runCommandNoOutput(allocator, &.{ "unzip", "-q", input_path, "-d", tmp_dir }, null);
    errdefer std.fs.cwd().deleteTree(tmp_dir) catch {};

    var tmp_handle = try std.fs.cwd().openDir(tmp_dir, .{ .iterate = true });
    defer tmp_handle.close();
    defer std.fs.cwd().deleteTree(tmp_dir) catch {};

    const session = try collectSessionFromDir(allocator, tmp_handle, input_path);
    defer freeCollectedSession(allocator, session);

    const json_bytes = try std.json.Stringify.valueAlloc(allocator, session, .{
        .whitespace = .indent_2,
    });
    defer allocator.free(json_bytes);

    try writeFileAbsolute(absolute_output, json_bytes);
}

pub fn applySessionJson(
    allocator: std.mem.Allocator,
    input_path: []const u8,
    session_json_path: []const u8,
    output_path: []const u8,
) !void {
    const absolute_output = try utils.resolveAbsolutePath(allocator, output_path);
    defer allocator.free(absolute_output);

    const absolute_session = try utils.resolveAbsolutePath(allocator, session_json_path);
    defer allocator.free(absolute_session);

    const session_json = try readFileAbsoluteAlloc(allocator, absolute_session, 256 * 1024 * 1024);
    defer allocator.free(session_json);

    var parsed = try std.json.parseFromSlice(WorkbenchSession, allocator, session_json, .{});
    defer parsed.deinit();

    const session = parsed.value;
    if (!std.mem.eql(u8, session.schema, session_schema)) {
        return WorkbenchError.InvalidSessionSchema;
    }

    const tmp_dir_alloc = try tempDir(allocator);
    const tmp_dir = std.mem.trim(u8, tmp_dir_alloc, "\r\n");
    defer allocator.free(tmp_dir_alloc);

    try utils.runCommandNoOutput(allocator, &.{ "unzip", "-q", input_path, "-d", tmp_dir }, null);
    errdefer std.fs.cwd().deleteTree(tmp_dir) catch {};

    var tmp_handle = try std.fs.cwd().openDir(tmp_dir, .{ .iterate = true });
    defer tmp_handle.close();
    defer std.fs.cwd().deleteTree(tmp_dir) catch {};

    var section_paths = try collectSectionPaths(tmp_handle, allocator);
    defer {
        for (section_paths.items) |path| allocator.free(path);
        section_paths.deinit(allocator);
    }

    var seen = try allocator.alloc(bool, session.sections.len);
    defer allocator.free(seen);
    @memset(seen, false);

    for (section_paths.items) |path| {
        const section_idx = findSectionIndex(session.sections, path) orelse {
            return WorkbenchError.MissingSectionInSession;
        };
        seen[section_idx] = true;

        const xml_data = try tmp_handle.readFileAlloc(allocator, path, 64 * 1024 * 1024);
        defer allocator.free(xml_data);

        const rewritten = try xml_tools.applyRunTextValues(allocator, xml_data, session.sections[section_idx].nodes);
        defer allocator.free(rewritten);

        try tmp_handle.writeFile(.{
            .sub_path = path,
            .data = rewritten,
            .flags = .{ .truncate = true },
        });
    }

    for (seen) |is_seen| {
        if (!is_seen) return WorkbenchError.UnknownSectionInSession;
    }

    try utils.runCommandNoOutput(allocator, &.{ "zip", "-qr", absolute_output, "." }, tmp_dir);
}
