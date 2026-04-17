const std = @import("std");

const formats = @import("formats.zig");
const hwp = @import("hwp.zig");
const hwpx = @import("hwpx.zig");
const workbench = @import("workbench.zig");

const AppError = error{
    InvalidArgument,
    UnsupportedCommand,
    UnsupportedLegacyEdit,
};

fn printUsage(writer: *std.Io.Writer) !void {
    try writer.writeAll(
        \\openhwp (Zig) - hwp/hwpx utility
        \\사용법:
        \\  openhwp info <문서>
        \\  openhwp text <문서>
        \\  openhwp replace <문서> "<찾을문자열>" "<대체문자열>" --output <출력파일>
        \\  openhwp workbench export <문서.hwpx> --output <세션.json>
        \\  openhwp workbench apply <문서.hwpx> <세션.json> --output <출력.hwpx>
        \\
    );
}

fn cmdInfo(path: []const u8, writer: *std.Io.Writer) !void {
    const info = try formats.detectFromPath(path);
    try writer.print("{s}: {s}, editable={any}\n", .{ path, info.name, info.editable });
}

fn cmdText(allocator: std.mem.Allocator, path: []const u8, writer: *std.Io.Writer) !void {
    const info = try formats.detectFromPath(path);
    const text = switch (info.format) {
        .hwpx => try hwpx.extractText(allocator, path),
        .hwp => try hwp.extractText(allocator, path),
    };
    defer allocator.free(text);
    try writer.writeAll(text);
    if (text.len > 0) try writer.writeByte('\n');
}

fn cmdReplace(allocator: std.mem.Allocator, path: []const u8, find: []const u8, replace: []const u8, out: []const u8) !void {
    if (find.len == 0) return AppError.InvalidArgument;

    const info = try formats.detectFromPath(path);
    const output_info = try formats.detectFromPath(out);
    if (output_info.format != .hwpx) return AppError.InvalidArgument;

    switch (info.format) {
        .hwpx => try hwpx.replaceText(allocator, path, out, find, replace),
        .hwp => return AppError.UnsupportedLegacyEdit,
    }
}

fn cmdWorkbenchExport(allocator: std.mem.Allocator, path: []const u8, output_json: []const u8) !void {
    const info = try formats.detectFromPath(path);
    if (info.format != .hwpx) return AppError.UnsupportedLegacyEdit;
    try workbench.exportSessionJson(allocator, path, output_json);
}

fn cmdWorkbenchApply(allocator: std.mem.Allocator, path: []const u8, session_json: []const u8, output_hwpx: []const u8) !void {
    const info = try formats.detectFromPath(path);
    if (info.format != .hwpx) return AppError.UnsupportedLegacyEdit;

    const out_info = try formats.detectFromPath(output_hwpx);
    if (out_info.format != .hwpx) return AppError.InvalidArgument;

    try workbench.applySessionJson(allocator, path, session_json, output_hwpx);
}

fn runCli(allocator: std.mem.Allocator) !void {
    var stdout_file = std.fs.File.stdout();
    var stdout_buffer: [4096]u8 = undefined;
    var stdout = stdout_file.writer(&stdout_buffer);
    defer stdout.interface.flush() catch {};
    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    if (args.len < 2) {
        try printUsage(&stdout.interface);
        return;
    }
    const cmd = args[1];

    if (std.mem.eql(u8, cmd, "info")) {
        if (args.len != 3) return AppError.InvalidArgument;
        try cmdInfo(args[2], &stdout.interface);
        return;
    }

    if (std.mem.eql(u8, cmd, "text")) {
        if (args.len != 3) return AppError.InvalidArgument;
        try cmdText(allocator, args[2], &stdout.interface);
        return;
    }

    if (std.mem.eql(u8, cmd, "replace")) {
        if (args.len != 7) return AppError.InvalidArgument;
        if (!std.mem.eql(u8, args[5], "--output")) return AppError.InvalidArgument;
        try cmdReplace(allocator, args[2], args[3], args[4], args[6]);
        try stdout.interface.print("저장 완료: {s}\n", .{args[6]});
        return;
    }

    if (std.mem.eql(u8, cmd, "workbench")) {
        if (args.len < 3) return AppError.InvalidArgument;
        const sub = args[2];

        if (std.mem.eql(u8, sub, "export")) {
            if (args.len != 6) return AppError.InvalidArgument;
            if (!std.mem.eql(u8, args[4], "--output")) return AppError.InvalidArgument;
            try cmdWorkbenchExport(allocator, args[3], args[5]);
            try stdout.interface.print("세션 저장 완료: {s}\n", .{args[5]});
            return;
        }

        if (std.mem.eql(u8, sub, "apply")) {
            if (args.len != 7) return AppError.InvalidArgument;
            if (!std.mem.eql(u8, args[5], "--output")) return AppError.InvalidArgument;
            try cmdWorkbenchApply(allocator, args[3], args[4], args[6]);
            try stdout.interface.print("문서 저장 완료: {s}\n", .{args[6]});
            return;
        }

        return AppError.InvalidArgument;
    }

    return AppError.UnsupportedCommand;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const stderr = std.fs.File.stderr();
    var stderr_buffer: [4096]u8 = undefined;
    var stderr_writer = stderr.writer(&stderr_buffer);
    defer stderr_writer.interface.flush() catch {};
    runCli(allocator) catch |err| {
        switch (err) {
            error.UnsupportedFormat => {
                stderr_writer.interface.print("지원하지 않는 파일 형식입니다.\n", .{}) catch {};
            },
            error.UnsupportedLegacyFormat => {
                stderr_writer.interface.print("레거시 HWP는 현재 텍스트 추출/치환이 미완성입니다.\n", .{}) catch {};
            },
            AppError.InvalidArgument => {
                printUsage(&stderr_writer.interface) catch {};
            },
            AppError.UnsupportedCommand => {
                stderr_writer.interface.print("지원하지 않는 명령어이거나 HWP 편집은 아직 미지원입니다.\n", .{}) catch {};
            },
            AppError.UnsupportedLegacyEdit => {
                stderr_writer.interface.print(
                    "HWP 직접 편집은 지원하지 않습니다. 먼저 HWPX로 변환한 뒤 replace를 사용하세요.\n",
                    .{},
                ) catch {};
            },
            workbench.WorkbenchError.InvalidSessionSchema => {
                stderr_writer.interface.print("workbench 세션 파일 형식이 올바르지 않습니다.\n", .{}) catch {};
            },
            workbench.WorkbenchError.MissingSectionInSession => {
                stderr_writer.interface.print("세션에 필요한 section 정보가 누락되었습니다.\n", .{}) catch {};
            },
            workbench.WorkbenchError.UnknownSectionInSession => {
                stderr_writer.interface.print("세션에 현재 문서와 맞지 않는 section 정보가 포함되어 있습니다.\n", .{}) catch {};
            },
            error.TextNodeCountMismatch => {
                stderr_writer.interface.print("세션의 텍스트 노드 개수가 문서와 일치하지 않습니다.\n", .{}) catch {};
            },
            else => {
                stderr_writer.interface.print("실행 중 오류: {s}\n", .{@errorName(err)}) catch {};
            },
        }
    };
}
