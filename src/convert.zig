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

fn runExternalHwpToHwpxConverter(
    allocator: std.mem.Allocator,
    input_hwp_abs: []const u8,
    output_hwpx_abs: []const u8,
) !void {
    const exe = try getConverterExecutable(allocator);
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
        .hwp => try runExternalHwpToHwpxConverter(allocator, input_abs, output_abs),
    }
}
