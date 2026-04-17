const std = @import("std");

const utils = @import("utils.zig");
const xml_tools = @import("xml_tools.zig");

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

fn collectTextFromSections(dir: std.fs.Dir, allocator: std.mem.Allocator, out: *std.ArrayList(u8)) !void {
    var section_paths = try collectSectionPaths(dir, allocator);
    defer {
        for (section_paths.items) |path| allocator.free(path);
        section_paths.deinit(allocator);
    }

    for (section_paths.items) |rel_path| {
        const bytes = try dir.readFileAlloc(allocator, rel_path, 64 * 1024 * 1024);
        defer allocator.free(bytes);

        const plain = try xml_tools.extractText(allocator, bytes);
        defer allocator.free(plain);
        if (plain.len == 0) continue;

        if (out.items.len > 0) {
            try out.appendSlice(allocator, "\n\n");
        }
        try out.appendSlice(allocator, plain);
    }
}

fn replaceTextInSections(dir: std.fs.Dir, allocator: std.mem.Allocator, find: []const u8, replace: []const u8) !void {
    var section_paths = try collectSectionPaths(dir, allocator);
    defer {
        for (section_paths.items) |path| allocator.free(path);
        section_paths.deinit(allocator);
    }

    for (section_paths.items) |rel_path| {
        const bytes = try dir.readFileAlloc(allocator, rel_path, 64 * 1024 * 1024);
        defer allocator.free(bytes);

        const replaced = try xml_tools.replaceText(allocator, bytes, find, replace);
        defer allocator.free(replaced);

        if (!std.mem.eql(u8, bytes, replaced)) {
            try dir.writeFile(.{
                .sub_path = rel_path,
                .data = replaced,
                .flags = .{ .truncate = true },
            });
        }
    }
}

pub fn extractText(allocator: std.mem.Allocator, input_path: []const u8) ![]u8 {
    const cwd = try tempDir(allocator);
    const tmp_dir = std.mem.trim(u8, cwd, "\r\n");
    defer allocator.free(cwd);

    try utils.runCommandNoOutput(allocator, &.{ "unzip", "-q", input_path, "-d", tmp_dir }, null);
    errdefer std.fs.cwd().deleteTree(tmp_dir) catch {};

    var tmp_handle = try std.fs.cwd().openDir(tmp_dir, .{ .iterate = true });
    defer tmp_handle.close();
    defer std.fs.cwd().deleteTree(tmp_dir) catch {};

    var text = std.ArrayList(u8).empty;
    errdefer text.deinit(allocator);

    try collectTextFromSections(tmp_handle, allocator, &text);
    return text.toOwnedSlice(allocator);
}

pub fn replaceText(allocator: std.mem.Allocator, input_path: []const u8, output_path: []const u8, find: []const u8, replace: []const u8) !void {
    const absolute_out = try utils.resolveAbsolutePath(allocator, output_path);
    defer allocator.free(absolute_out);

    const cwd = try tempDir(allocator);
    const tmp_dir = std.mem.trim(u8, cwd, "\r\n");
    defer allocator.free(cwd);

    try utils.runCommandNoOutput(allocator, &.{ "unzip", "-q", input_path, "-d", tmp_dir }, null);
    errdefer std.fs.cwd().deleteTree(tmp_dir) catch {};

    var tmp_handle = try std.fs.cwd().openDir(tmp_dir, .{ .iterate = true });
    defer tmp_handle.close();
    defer std.fs.cwd().deleteTree(tmp_dir) catch {};

    try replaceTextInSections(tmp_handle, allocator, find, replace);
    try utils.runCommandNoOutput(allocator, &.{ "zip", "-qr", absolute_out, "." }, tmp_dir);
}
