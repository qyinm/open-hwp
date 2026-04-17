const std = @import("std");

pub const CommandError = error{
    CommandMissing,
    CommandFailed,
    CommandOutputTooLarge,
};

pub fn runCommand(
    allocator: std.mem.Allocator,
    argv: []const []const u8,
    cwd: ?[]const u8,
) ![]u8 {
    const run_result = std.process.Child.run(.{
        .allocator = allocator,
        .argv = argv,
        .cwd = cwd,
        .max_output_bytes = 50 * 1024 * 1024,
    }) catch |err| switch (err) {
        error.FileNotFound => return CommandError.CommandMissing,
        error.StdoutStreamTooLong, error.StderrStreamTooLong => return CommandError.CommandOutputTooLarge,
        else => return err,
    };
    defer allocator.free(run_result.stderr);

    switch (run_result.term) {
        .Exited => |code| {
            if (code != 0) {
                return error.CommandFailed;
            }
        },
        else => return error.CommandFailed,
    }

    return run_result.stdout;
}

pub fn runCommandNoOutput(
    allocator: std.mem.Allocator,
    argv: []const []const u8,
    cwd: ?[]const u8,
) !void {
    const out = try runCommand(allocator, argv, cwd);
    defer allocator.free(out);
}

pub fn resolveAbsolutePath(allocator: std.mem.Allocator, path: []const u8) ![]u8 {
    if (std.fs.path.isAbsolute(path)) {
        return try allocator.dupe(u8, path);
    }
    const cwd = try std.process.getCwdAlloc(allocator);
    defer allocator.free(cwd);
    return try std.fs.path.resolve(allocator, &.{ cwd, path });
}
