const std = @import("std");

const formats = @import("formats.zig");
const utils = @import("utils.zig");

pub const ConvertError = error{
    ConverterNotFound,
    ConverterFailed,
};

fn getConverterExecutable(allocator: std.mem.Allocator) ![]u8 {
    return std.process.getEnvVarOwned(allocator, "OPENHWP_HWPX_CONVERTER") catch |err| switch (err) {
        error.EnvironmentVariableNotFound => allocator.dupe(u8, "hwpx-converter"),
        else => err,
    };
}

fn getConverterExecutableWithOverride(
    allocator: std.mem.Allocator,
    converter_override: ?[]const u8,
) ![]u8 {
    if (converter_override) |path| return try allocator.dupe(u8, path);
    return getConverterExecutable(allocator);
}

fn runExternalHwpToHwpxConverter(
    allocator: std.mem.Allocator,
    input_hwp_abs: []const u8,
    output_hwpx_abs: []const u8,
    converter_override: ?[]const u8,
) !void {
    const exe = try getConverterExecutableWithOverride(allocator, converter_override);
    defer allocator.free(exe);

    const argv = [_][]const u8{
        exe,
        input_hwp_abs,
        output_hwpx_abs,
    };

    utils.runCommandNoOutput(allocator, &argv, null) catch |err| switch (err) {
        utils.CommandError.CommandMissing => return ConvertError.ConverterNotFound,
        utils.CommandError.CommandFailed => return ConvertError.ConverterFailed,
        else => return err,
    };
}

pub fn convertToHwpx(
    allocator: std.mem.Allocator,
    input_path: []const u8,
    output_path: []const u8,
) !void {
    return convertToHwpxWithConverter(allocator, input_path, output_path, null);
}

fn convertToHwpxWithConverter(
    allocator: std.mem.Allocator,
    input_path: []const u8,
    output_path: []const u8,
    converter_override: ?[]const u8,
) !void {
    const input_info = try formats.detectFromPath(input_path);
    const output_info = try formats.detectFromPath(output_path);
    if (output_info.format != .hwpx) return error.UnsupportedFormat;

    const input_abs = try utils.resolveAbsolutePath(allocator, input_path);
    defer allocator.free(input_abs);

    const output_abs = try utils.resolveAbsolutePath(allocator, output_path);
    defer allocator.free(output_abs);

    if (std.mem.eql(u8, input_abs, output_abs)) {
        return;
    }

    switch (input_info.format) {
        .hwpx => try std.fs.copyFileAbsolute(input_abs, output_abs, .{}),
        .hwp => try runExternalHwpToHwpxConverter(allocator, input_abs, output_abs, converter_override),
    }
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

test "convertToHwpx invokes external converter for hwp input" {
    const allocator = std.testing.allocator;

    const fixture_abs = try utils.resolveAbsolutePath(allocator, "tests/fixtures/example.hwp");
    defer allocator.free(fixture_abs);

    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();

    const tmp_abs = try tmp.parent_dir.realpathAlloc(allocator, &tmp.sub_path);
    defer allocator.free(tmp_abs);

    const output_abs = try std.fs.path.resolve(allocator, &.{ tmp_abs, "out.hwpx" });
    defer allocator.free(output_abs);

    const script_name = "fake_converter.sh";
    const script_source =
        \\#!/bin/sh
        \\echo "input:$1" > "$2"
        \\echo "output:$2" >> "$2"
    ;
    try tmp.dir.writeFile(.{ .sub_path = script_name, .data = script_source });
    const script_file = try tmp.dir.openFile(script_name, .{});
    defer script_file.close();
    try script_file.chmod(0o755);

    const script_abs = try std.fs.path.resolve(allocator, &.{ tmp_abs, script_name });
    defer allocator.free(script_abs);

    try convertToHwpxWithConverter(allocator, fixture_abs, output_abs, script_abs);

    const output = try readFileAbsoluteAlloc(allocator, output_abs, 4096);
    defer allocator.free(output);

    const expected_input = try std.fmt.allocPrint(allocator, "input:{s}\n", .{fixture_abs});
    defer allocator.free(expected_input);
    try std.testing.expect(std.mem.indexOf(u8, output, expected_input) != null);

    const expected_output = try std.fmt.allocPrint(allocator, "output:{s}\n", .{output_abs});
    defer allocator.free(expected_output);
    try std.testing.expect(std.mem.indexOf(u8, output, expected_output) != null);
}

test "convertToHwpx returns ConverterNotFound when converter is missing" {
    const allocator = std.testing.allocator;

    const fixture_abs = try utils.resolveAbsolutePath(allocator, "tests/fixtures/example.hwp");
    defer allocator.free(fixture_abs);

    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();

    const tmp_abs = try tmp.parent_dir.realpathAlloc(allocator, &tmp.sub_path);
    defer allocator.free(tmp_abs);

    const output_abs = try std.fs.path.resolve(allocator, &.{ tmp_abs, "out.hwpx" });
    defer allocator.free(output_abs);

    try std.testing.expectError(
        ConvertError.ConverterNotFound,
        convertToHwpxWithConverter(allocator, fixture_abs, output_abs, "/definitely/missing/hwpx-converter"),
    );
}

test "convertToHwpx copies hwpx input without converter usage" {
    const allocator = std.testing.allocator;

    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();

    const tmp_abs = try tmp.parent_dir.realpathAlloc(allocator, &tmp.sub_path);
    defer allocator.free(tmp_abs);

    const input_abs = try std.fs.path.resolve(allocator, &.{ tmp_abs, "in.hwpx" });
    defer allocator.free(input_abs);

    const output_abs = try std.fs.path.resolve(allocator, &.{ tmp_abs, "out.hwpx" });
    defer allocator.free(output_abs);

    try writeFileAbsolute(input_abs, "stub hwpx payload");
    try convertToHwpxWithConverter(allocator, input_abs, output_abs, "/definitely/missing/hwpx-converter");

    const copied = try readFileAbsoluteAlloc(allocator, output_abs, 1024);
    defer allocator.free(copied);
    try std.testing.expectEqualStrings("stub hwpx payload", copied);
}
