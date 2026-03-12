# Walk — A Warp-Inspired Terminal Emulator

> GPU-accelerated, cross-platform terminal with Blocks, modern input editing, and deep customization. No AI, no login, no cloud. Just a fast terminal.

**Language:** Rust (2021 edition, MSRV 1.75+)
**Rendering:** Platform-native GPU APIs (Metal on macOS, Vulkan on Linux, DX12 on Windows)
**Shells:** Bash, Zsh, Fish, PowerShell, WSL passthrough
**Platforms:** macOS (ARM64 + x86_64), Linux (X11 + Wayland), Windows 10/11 (native + WSL)

---

## Phase 1: Core Platform & Windowing (+platform)

### Task 1 (A) +platform
**PURPOSE** — Establishes the application entry point and cross-platform event loop; every other module depends on having a window and an event stream.

**WHAT TO DO**
1. Create the project scaffold: `cargo init walk`, set up a Cargo workspace in `/Cargo.toml` with member crates `walk-core`, `walk-renderer`, `walk-platform`, `walk-pty`, `walk-ui`, `walk-config`.
2. In `walk-platform/src/lib.rs`, integrate `winit 0.30+` as the windowing backend. Create a `WalkWindow` struct wrapping `winit::window::Window` with fields: `title: String`, `size: PhysicalSize<u32>`, `scale_factor: f64`, `is_focused: bool`.
3. Implement `WalkWindow::new(config: &WindowConfig) -> Result<Self, PlatformError>` that creates a resizable, titled window with a minimum size of 400×300 pixels.
4. In `walk-platform/src/event_loop.rs`, create `fn run_event_loop(window: WalkWindow, mut app: impl AppHandler)` that starts the `winit` event loop and dispatches `AppHandler` trait methods: `on_redraw()`, `on_resize(new_size)`, `on_key_event(KeyEvent)`, `on_mouse_event(MouseEvent)`, `on_focus_change(bool)`, `on_close_requested()`.
5. Define the `AppHandler` trait in `walk-platform/src/handler.rs` with all six methods above, each with default no-op implementations.

**DONE WHEN**
- [ ] `cargo build --workspace` succeeds with zero errors on macOS, Linux, and Windows.
- [ ] Running the binary opens a native window with the title "Walk" that responds to resize, focus, and close events (verified by logging each event to stdout).

---

### Task 2 (A) +platform
**PURPOSE** — Provides a high-resolution timer and frame-pacing mechanism so the renderer can target 60fps (or display refresh rate) without spinning the CPU.

**WHAT TO DO**
1. In `walk-platform/src/frame_clock.rs`, create `FrameClock` struct with fields: `target_fps: u32`, `last_frame: Instant`, `frame_count: u64`, `accumulated_time: Duration`.
2. Implement `FrameClock::new(target_fps: u32) -> Self` defaulting to 60fps.
3. Implement `FrameClock::should_render(&mut self) -> bool` that returns `true` if elapsed time since `last_frame` exceeds `1.0 / target_fps` seconds, and updates `last_frame` accordingly.
4. Implement `FrameClock::fps(&self) -> f64` that returns a rolling average FPS over the last 60 frames.
5. Integrate `FrameClock` into the event loop from Task 1: only call `on_redraw()` when `should_render()` returns true, and request a new frame via `window.request_redraw()`.

**DONE WHEN**
- [ ] With an empty `on_redraw()`, CPU usage stays below 5% at idle (no spinning).
- [ ] `FrameClock::fps()` reports a value within ±2 of the target FPS when the window is focused.

---

### Task 3 (A) +platform
**PURPOSE** — Abstracts platform-specific raw window handle access so the renderer crates can obtain native surface handles (CAMetalLayer, HWND, X11 Display/Window, Wayland surface).

**WHAT TO DO**
1. Add `raw-window-handle = "0.6"` to `walk-platform/Cargo.toml`.
2. Implement `HasRawWindowHandle` and `HasRawDisplayHandle` for `WalkWindow` by delegating to the inner `winit::window::Window`.
3. In `walk-platform/src/surface.rs`, create an enum `NativeSurface` with variants: `Metal { layer: *mut c_void }`, `Vulkan { instance: u64, surface: u64 }`, `Dx12 { hwnd: *mut c_void }`, `X11 { display: *mut c_void, window: u64 }`, `Wayland { display: *mut c_void, surface: *mut c_void }`.
4. Implement `NativeSurface::from_window(window: &WalkWindow) -> Result<Self, PlatformError>` that inspects the raw handle type and constructs the correct variant.

**DONE WHEN**
- [ ] On macOS, `NativeSurface::from_window` returns `Metal { .. }` with a non-null layer pointer.
- [ ] On Linux (X11), returns `X11 { .. }` with valid display and window handles.
- [ ] On Windows, returns `Dx12 { .. }` with a valid HWND.

---

### Task 4 (B) +platform
**PURPOSE** — Input event normalization: converts raw `winit` key events into a Walk-internal `KeyAction` enum so downstream modules (input editor, keybindings) work with a stable, platform-agnostic type.

**WHAT TO DO**
1. In `walk-platform/src/input.rs`, define `KeyAction` enum with variants: `Char(char)`, `Enter`, `Tab`, `Backspace`, `Delete`, `Escape`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `FunctionKey(u8)`, `Copy`, `Paste`, `Cut`, `SelectAll`, `Undo`, `Redo`.
2. Define `Modifiers` struct with fields: `ctrl: bool`, `alt: bool`, `shift: bool`, `meta: bool` (meta = Cmd on macOS, Win on Windows).
3. Define `InputEvent` struct: `{ action: KeyAction, modifiers: Modifiers, is_repeat: bool }`.
4. Implement `fn translate_key_event(event: &winit::event::KeyEvent, modifiers: &winit::event::Modifiers) -> Option<InputEvent>` that maps winit's `KeyCode` and `ModifiersState` to `InputEvent`. Handle platform differences: Cmd+C on macOS and Ctrl+C on Linux/Windows both map to `KeyAction::Copy`.
5. Wire `translate_key_event` into the event loop from Task 1 so `AppHandler::on_key_event` receives `InputEvent` instead of raw winit events.

**DONE WHEN**
- [ ] Pressing Cmd+C on macOS, Ctrl+C on Linux, and Ctrl+C on Windows all produce `InputEvent { action: KeyAction::Copy, modifiers: Modifiers { ctrl: true, .. }, .. }` (with `meta: true` on macOS).
- [ ] Arrow keys, function keys F1-F12, and modifier-only presses are correctly translated or filtered.

---

### Task 5 (B) +platform
**PURPOSE** — DPI/scale-factor awareness so text and UI elements render crisply on HiDPI/Retina displays without manual scaling.

**WHAT TO DO**
1. In `walk-platform/src/dpi.rs`, create `ScaleContext` struct: `{ scale_factor: f64, physical_size: PhysicalSize<u32>, logical_size: LogicalSize<f64> }`.
2. Implement `ScaleContext::from_window(window: &WalkWindow) -> Self`.
3. Implement `ScaleContext::logical_to_physical(&self, x: f64, y: f64) -> (u32, u32)` and `physical_to_logical(&self, x: u32, y: u32) -> (f64, f64)`.
4. Hook into `winit`'s `ScaleFactorChanged` event in the event loop. When it fires, update `ScaleContext` and invoke a new `AppHandler::on_scale_factor_changed(new_ctx: ScaleContext)` method.
5. All downstream rendering and layout code must use `ScaleContext` for coordinate conversion — enforce this by making `ScaleContext` a required parameter in the renderer's `begin_frame()` (Task 8+).

**DONE WHEN**
- [ ] Moving the window between a 1x and 2x display triggers `on_scale_factor_changed` with the correct new scale factor.
- [ ] Text rendered at 14pt logical size appears identical in physical sharpness on both 1x and 2x displays.

---

## Phase 2: GPU Rendering Pipeline (+renderer)

### Task 6 (A) +renderer
**PURPOSE** — Defines the renderer trait abstraction so the rest of the app codes against a single interface while platform-specific backends (Metal, Vulkan, DX12) implement it.

**WHAT TO DO**
1. In `walk-renderer/src/lib.rs`, define trait `Renderer`:
   ```rust
   pub trait Renderer {
       fn init(surface: &NativeSurface, size: PhysicalSize<u32>, scale: f64) -> Result<Self, RendererError> where Self: Sized;
       fn resize(&mut self, new_size: PhysicalSize<u32>, scale: f64);
       fn begin_frame(&mut self) -> Result<Frame, RendererError>;
       fn draw_rect(&mut self, frame: &mut Frame, rect: Rect, color: Color);
       fn draw_glyph(&mut self, frame: &mut Frame, glyph: &RasterizedGlyph, pos: Point, color: Color);
       fn draw_image(&mut self, frame: &mut Frame, texture_id: TextureId, rect: Rect, opacity: f32);
       fn end_frame(&mut self, frame: Frame) -> Result<(), RendererError>;
       fn create_texture(&mut self, width: u32, height: u32, data: &[u8]) -> Result<TextureId, RendererError>;
       fn update_texture(&mut self, id: TextureId, region: Rect, data: &[u8]) -> Result<(), RendererError>;
   }
   ```
2. Define supporting types in `walk-renderer/src/types.rs`: `Rect { x: f32, y: f32, w: f32, h: f32 }`, `Point { x: f32, y: f32 }`, `Color { r: f32, g: f32, b: f32, a: f32 }`, `TextureId(u64)`, `Frame { command_buffer: Vec<DrawCommand> }`.
3. Define `DrawCommand` enum: `FillRect { rect, color }`, `DrawGlyph { glyph_index, pos, color, texture_id }`, `DrawImage { texture_id, rect, opacity }`.
4. In `walk-renderer/src/backend.rs`, create `fn create_renderer(surface: &NativeSurface, size: PhysicalSize<u32>, scale: f64) -> Result<Box<dyn Renderer>, RendererError>` that pattern-matches on `NativeSurface` variant and returns the correct backend.

**DONE WHEN**
- [ ] `walk-renderer` compiles with the trait and types defined, with no backend implementations yet (just the trait + factory function signature).
- [ ] The `create_renderer` factory function compiles and returns `Err(RendererError::Unimplemented)` for all surface types.

---

### Task 7 (A) +renderer
**PURPOSE** — Implements the Metal rendering backend for macOS, enabling GPU-accelerated drawing of rectangles and textured quads (glyphs).

**WHAT TO DO**
1. Add `metal = "0.29"` and `objc2 = "0.5"` to `walk-renderer/Cargo.toml` behind a `#[cfg(target_os = "macos")]` feature gate.
2. Create `walk-renderer/src/metal_backend.rs`. Implement `MetalRenderer` struct with fields: `device: metal::Device`, `command_queue: metal::CommandQueue`, `layer: metal::MetalLayer`, `pipeline_state: metal::RenderPipelineState`, `vertex_buffer: metal::Buffer`, `glyph_atlas_texture: metal::Texture`.
3. Write Metal Shading Language (MSL) shaders inline as a const string: a vertex shader that takes position (float2) + texcoord (float2) + color (float4) and a fragment shader that samples a texture and multiplies by vertex color. Compile via `device.new_library_with_source()`.
4. Implement `Renderer::init` for `MetalRenderer`: obtain the `CAMetalLayer` from the surface, set pixel format to `BGRA8Unorm`, create device, queue, compile shaders, create pipeline state, allocate a 4096×4096 glyph atlas texture.
5. Implement `Renderer::begin_frame`: get next drawable from the layer, create command buffer and render command encoder, clear to background color.
6. Implement `Renderer::draw_rect`: append 6 vertices (2 triangles) for the rect to the vertex buffer with the given color and a white 1x1 texcoord region.
7. Implement `Renderer::draw_glyph`: append 6 vertices with the glyph's atlas UV coordinates.
8. Implement `Renderer::end_frame`: end encoding, present drawable, commit command buffer.
9. Implement `Renderer::resize`: update layer drawable size.
10. Implement `Renderer::create_texture` and `update_texture` for atlas region uploads using `texture.replace_region()`.

**DONE WHEN**
- [ ] On macOS, calling `draw_rect(frame, Rect { x: 100.0, y: 100.0, w: 200.0, h: 50.0 }, Color::RED)` renders a red rectangle at the specified position.
- [ ] Calling `draw_glyph` with a pre-rasterized 'A' glyph renders the letter at the correct position with correct color.
- [ ] Window resize does not crash or produce artifacts; the drawable size matches the new window size.

---

### Task 8 (A) +renderer
**PURPOSE** — Implements the Vulkan rendering backend for Linux, providing GPU-accelerated rendering on X11 and Wayland.

**WHAT TO DO**
1. Add `ash = "0.38"` and `gpu-allocator = "0.27"` to `walk-renderer/Cargo.toml` behind `#[cfg(target_os = "linux")]`.
2. Create `walk-renderer/src/vulkan_backend.rs`. Implement `VulkanRenderer` struct with fields: `instance: ash::Instance`, `device: ash::Device`, `surface: vk::SurfaceKHR`, `swapchain: vk::SwapchainKHR`, `render_pass: vk::RenderPass`, `pipeline: vk::Pipeline`, `command_pool: vk::CommandPool`, `command_buffers: Vec<vk::CommandBuffer>`, `glyph_atlas: vk::Image`, `vertex_buffer: vk::Buffer`, `allocator: gpu_allocator::vulkan::Allocator`.
3. Write GLSL vertex and fragment shaders (same interface as Task 7's MSL) and compile to SPIR-V at build time using `shaderc` in `build.rs` or embed pre-compiled SPIR-V bytes.
4. Implement `Renderer::init`: create Vulkan instance with validation layers (debug builds only), select physical device (prefer discrete GPU), create logical device + graphics queue, create surface from `NativeSurface::Vulkan` or `NativeSurface::X11`/`Wayland`, create swapchain (BGRA8 UNORM, FIFO present mode), create render pass, create graphics pipeline, allocate vertex buffer (16MB dynamic), create 4096×4096 glyph atlas image + image view + sampler, create descriptor set layout + pool + set, allocate command buffers (one per swapchain image).
5. Implement `begin_frame`: acquire next swapchain image, begin command buffer, begin render pass, bind pipeline.
6. Implement `draw_rect` and `draw_glyph`: batch vertices into the vertex buffer; update descriptor set if atlas texture changed.
7. Implement `end_frame`: end render pass, end command buffer, submit to queue, present swapchain image. Handle `VK_ERROR_OUT_OF_DATE_KHR` by triggering swapchain recreation.
8. Implement `resize`: recreate swapchain, framebuffers, and command buffers.

**DONE WHEN**
- [ ] On Linux (X11 or Wayland), the same `draw_rect` test from Task 7 renders correctly.
- [ ] Swapchain recreation on resize completes without validation layer errors.
- [ ] `vulkaninfo` validation layers report zero errors during a 30-second session.

---

### Task 9 (A) +renderer
**PURPOSE** — Implements the DirectX 12 rendering backend for Windows.

**WHAT TO DO**
1. Add `windows = "0.58"` (with features `Win32_Graphics_Direct3D12`, `Win32_Graphics_Dxgi`, `Win32_Graphics_Direct3D`) to `walk-renderer/Cargo.toml` behind `#[cfg(target_os = "windows")]`.
2. Create `walk-renderer/src/dx12_backend.rs`. Implement `Dx12Renderer` struct with fields: `device: ID3D12Device`, `command_queue: ID3D12CommandQueue`, `swap_chain: IDXGISwapChain4`, `rtv_heap: ID3D12DescriptorHeap`, `command_allocators: Vec<ID3D12CommandAllocator>`, `command_list: ID3D12GraphicsCommandList`, `root_signature: ID3D12RootSignature`, `pipeline_state: ID3D12PipelineState`, `vertex_buffer: ID3D12Resource`, `glyph_atlas: ID3D12Resource`, `fence: ID3D12Fence`, `fence_value: u64`.
3. Write HLSL vertex and fragment (pixel) shaders matching the same vertex layout as Tasks 7-8. Compile to DXBC/DXIL at build time or embed pre-compiled bytes.
4. Implement `Renderer::init`: create DXGI factory, enumerate adapters (prefer hardware), create D3D12 device, create command queue, create swap chain for the HWND from `NativeSurface::Dx12`, create RTV descriptor heap, create root signature (one CBV for transforms, one SRV for atlas texture, one sampler), create PSO, allocate upload heap vertex buffer (16MB), create committed resource for 4096×4096 atlas, create fence for CPU-GPU sync.
5. Implement `begin_frame`: wait on fence, reset command allocator + command list, set render target, clear.
6. Implement `draw_rect` and `draw_glyph`: batch into vertex buffer, set vertex buffer view, draw instanced.
7. Implement `end_frame`: transition render target to present state, close command list, execute, present swap chain, signal fence.
8. Implement `resize`: wait for GPU idle, release back buffers, resize swap chain buffers, recreate RTVs.

**DONE WHEN**
- [ ] On Windows, the `draw_rect` and `draw_glyph` tests produce identical visual output to macOS and Linux backends.
- [ ] D3D12 debug layer reports zero errors during a 30-second session.
- [ ] Resize is smooth with no black frames or flicker.

---

### Task 10 (A) +text
**PURPOSE** — Font loading and glyph rasterization: converts font files into rasterized glyph bitmaps that the renderer can upload to the GPU atlas.

**WHAT TO DO**
1. Add `fontdue = "0.9"` to `walk-renderer/Cargo.toml` (pure Rust font rasterizer, no system dependencies).
2. Create `walk-renderer/src/font.rs`. Define `FontConfig { family: String, size_px: f32, bold: bool, italic: bool }`.
3. Implement `FontManager` struct with fields: `regular: fontdue::Font`, `bold: fontdue::Font`, `italic: fontdue::Font`, `bold_italic: fontdue::Font`, `size_px: f32`, `metrics: fontdue::LineMetrics`.
4. Implement `FontManager::load(config: &FontConfig) -> Result<Self, FontError>` that searches for system fonts using `font-kit = "0.14"` crate's `SystemSource`, falls back to a bundled monospace font (embed JetBrains Mono via `include_bytes!`).
5. Implement `FontManager::rasterize(&self, c: char, style: GlyphStyle) -> RasterizedGlyph` where `RasterizedGlyph { bitmap: Vec<u8>, width: u32, height: u32, bearing_x: f32, bearing_y: f32, advance: f32 }` and `GlyphStyle` is an enum `{ Regular, Bold, Italic, BoldItalic }`.
6. Implement `FontManager::line_height(&self) -> f32`, `FontManager::cell_width(&self) -> f32` (advance of 'M'), `FontManager::baseline(&self) -> f32`.

**DONE WHEN**
- [ ] `FontManager::load` with default config succeeds on all three platforms, loading JetBrains Mono if no system monospace is found.
- [ ] `rasterize('A', Regular)` returns a `RasterizedGlyph` with a non-empty bitmap, width > 0, height > 0.
- [ ] `line_height()` and `cell_width()` return positive values consistent with a 14px monospace font (cell_width ≈ 8.4, line_height ≈ 20).

---

### Task 11 (A) +text
**PURPOSE** — Glyph atlas management: packs rasterized glyphs into a GPU texture atlas using a shelf-packing algorithm so glyphs are uploaded once and reused.

**WHAT TO DO**
1. Create `walk-renderer/src/atlas.rs`. Define `GlyphAtlas` struct: `{ texture_id: TextureId, width: u32, height: u32, shelf_height: u32, cursor_x: u32, cursor_y: u32, entries: HashMap<GlyphKey, AtlasEntry> }` where `GlyphKey { char: char, style: GlyphStyle, size_px_x10: u32 }` (size multiplied by 10 to avoid float keys) and `AtlasEntry { uv: Rect, bearing_x: f32, bearing_y: f32, advance: f32 }`.
2. Implement `GlyphAtlas::new(renderer: &mut dyn Renderer, width: u32, height: u32) -> Self`: creates the backing GPU texture via `renderer.create_texture()`.
3. Implement `GlyphAtlas::get_or_insert(&mut self, c: char, style: GlyphStyle, font: &FontManager, renderer: &mut dyn Renderer) -> &AtlasEntry`: if `GlyphKey` exists in `entries`, return it. Otherwise, rasterize via `font.rasterize()`, find shelf space using shelf-first-fit (advance `cursor_x`; if glyph doesn't fit horizontally, move to next shelf row by advancing `cursor_y` by `shelf_height`; if atlas is full, panic with a TODO for atlas resize). Upload bitmap to texture via `renderer.update_texture()` at the allocated region. Insert and return the new entry.
4. Implement `GlyphAtlas::clear(&mut self)`: resets all cursors and entries (for when font size changes).

**DONE WHEN**
- [ ] After inserting all printable ASCII chars (0x20-0x7E), calling `get_or_insert` for each returns a valid `AtlasEntry` with UV coordinates within [0,1].
- [ ] No two entries overlap in UV space (verified by a unit test that checks all rects for non-intersection).
- [ ] Inserting the same char twice returns the same `AtlasEntry` without re-uploading.

---

### Task 12 (A) +text
**PURPOSE** — Text shaping and layout: arranges a sequence of characters into positioned glyph runs, handling basic ligatures and combining characters for correct terminal text rendering.

**WHAT TO DO**
1. Create `walk-renderer/src/text_layout.rs`. Define `GlyphRun { glyphs: Vec<PositionedGlyph> }` and `PositionedGlyph { atlas_entry: AtlasEntry, x: f32, y: f32, color: Color }`.
2. Implement `fn layout_line(text: &str, start_x: f32, baseline_y: f32, style: GlyphStyle, color: Color, font: &FontManager, atlas: &mut GlyphAtlas, renderer: &mut dyn Renderer) -> GlyphRun`: iterate chars, call `atlas.get_or_insert()` for each, position each glyph at `(start_x + cumulative_advance + bearing_x, baseline_y - bearing_y)`, accumulate advance.
3. Handle wide characters (CJK, emoji): use `unicode_width::UnicodeWidthChar` to detect double-width characters and advance by `2 * cell_width` for those. Add `unicode-width = "0.2"` to dependencies.
4. Implement `fn layout_grid(cells: &[Vec<Cell>], origin: Point, font: &FontManager, atlas: &mut GlyphAtlas, renderer: &mut dyn Renderer) -> Vec<GlyphRun>` where `Cell { char: char, style: CellStyle }` and `CellStyle { fg: Color, bg: Color, bold: bool, italic: bool, underline: bool, strikethrough: bool }`. Layout each cell at `(col * cell_width, row * line_height)` grid positions.

**DONE WHEN**
- [ ] `layout_line("Hello", 0.0, 20.0, Regular, WHITE, ...)` produces 5 `PositionedGlyph` entries with strictly increasing x positions.
- [ ] A CJK character (e.g., '漢') occupies 2 cell widths in the output positions.
- [ ] `layout_grid` positions glyphs correctly on a 80×24 grid (glyph at col 5, row 3 has x = 5*cell_width, y = 3*line_height + baseline_offset).

---

## Phase 3: Terminal Emulation (+vt, +pty)

### Task 13 (A) +pty
**PURPOSE** — Creates and manages pseudo-terminal (PTY) sessions on Unix (macOS, Linux), enabling the terminal to spawn and communicate with shell processes.

**WHAT TO DO**
1. Create `walk-pty/src/lib.rs`. Define `PtyConfig { shell: String, args: Vec<String>, env: HashMap<String, String>, cwd: PathBuf, rows: u16, cols: u16 }`.
2. Define `PtySession` struct: `{ master_fd: OwnedFd, child_pid: Pid, reader: BufReader<File>, writer: File }`.
3. Implement `PtySession::spawn(config: &PtyConfig) -> Result<Self, PtyError>` using `libc::openpty()` to create master/slave pair, `libc::fork()` to create child process. In the child: call `setsid()`, set slave as controlling terminal via `ioctl(TIOCSCTTY)`, dup2 slave to stdin/stdout/stderr, close master fd, set environment variables from config, `chdir` to `cwd`, `exec` the shell.
4. Implement `PtySession::read(&mut self, buf: &mut [u8]) -> Result<usize, PtyError>`: non-blocking read from master fd using `libc::read` with `O_NONBLOCK`.
5. Implement `PtySession::write(&mut self, data: &[u8]) -> Result<usize, PtyError>`: write to master fd.
6. Implement `PtySession::resize(&self, rows: u16, cols: u16) -> Result<(), PtyError>`: `ioctl(master_fd, TIOCSWINSZ, &winsize)`.
7. Implement `PtySession::is_alive(&self) -> bool`: `waitpid(child_pid, WNOHANG)` returns 0.
8. Implement `Drop for PtySession`: send SIGHUP to child, close master fd.

**DONE WHEN**
- [ ] `PtySession::spawn` with `shell: "/bin/bash"` creates a child process (verified by `ps` showing the bash process).
- [ ] Writing `"echo hello\n".as_bytes()` and reading back produces output containing `"hello"`.
- [ ] `resize(40, 120)` does not error and a subsequent `tput cols` in the shell reports 120.

---

### Task 14 (A) +pty
**PURPOSE** — Implements PTY support on Windows using ConPTY for native PowerShell and cmd.exe, and WSL passthrough for Linux shells on Windows.

**WHAT TO DO**
1. Create `walk-pty/src/windows.rs` behind `#[cfg(target_os = "windows")]`.
2. Implement `ConPtySession` struct using the Windows `CreatePseudoConsole` API via the `windows` crate. Fields: `pty_handle: HPCON`, `input_pipe: HANDLE`, `output_pipe: HANDLE`, `process_info: PROCESS_INFORMATION`.
3. Implement `ConPtySession::spawn(config: &PtyConfig)`: create input/output pipes via `CreatePipe`, call `CreatePseudoConsole` with initial size, set up `STARTUPINFOEX` with the pseudo console attribute via `UpdateProcThreadAttribute`, call `CreateProcessW` with the shell path.
4. For WSL passthrough: detect WSL availability by checking `wsl.exe` existence. When `config.shell` starts with `wsl`, spawn `wsl.exe -d <distro> -- <shell>` as the process, passing through the ConPTY.
5. Implement `read`, `write`, `resize` (`ResizePseudoConsole`), `is_alive` (`GetExitCodeProcess` with `STILL_ACTIVE`), and `Drop` (close handles, terminate process).
6. Unify the interface: in `walk-pty/src/lib.rs`, create `enum PtyBackend { Unix(PtySession), Windows(ConPtySession) }` and implement all methods by delegation. Export a single `fn create_pty(config: &PtyConfig) -> Result<PtyBackend, PtyError>`.

**DONE WHEN**
- [ ] On Windows, `create_pty` with `shell: "powershell.exe"` spawns PowerShell and echoing a command returns output.
- [ ] On Windows with WSL installed, `create_pty` with `shell: "wsl bash"` opens a bash session where `uname` returns "Linux".
- [ ] `resize` works correctly for ConPTY (verified by `$Host.UI.RawUI.WindowSize` in PowerShell reporting the new size).

---

### Task 15 (A) +pty
**PURPOSE** — Asynchronous PTY I/O: spawns a dedicated reader thread that continuously reads PTY output and sends it to the main thread via a channel, preventing UI blocking.

**WHAT TO DO**
1. In `walk-pty/src/async_io.rs`, create `PtyIoHandle` struct: `{ writer: Arc<Mutex<PtyBackend>>, rx: Receiver<PtyEvent>, _reader_thread: JoinHandle<()> }`.
2. Define `PtyEvent` enum: `Data(Vec<u8>)`, `Exited(i32)`, `Error(PtyError)`.
3. Implement `PtyIoHandle::new(pty: PtyBackend) -> Self`: wrap pty in `Arc<Mutex<>>`, spawn a thread that loops: read up to 64KB from the PTY into a buffer, send `PtyEvent::Data(buf[..n].to_vec())` through a `crossbeam_channel::bounded(256)` channel. On read error, send `PtyEvent::Error`. On EOF, send `PtyEvent::Exited` with the exit code. Sleep 1ms between reads to avoid busy-looping when no data is available.
4. Implement `PtyIoHandle::try_recv(&self) -> Option<PtyEvent>`: non-blocking receive from the channel.
5. Implement `PtyIoHandle::write(&self, data: &[u8]) -> Result<(), PtyError>`: lock the mutex, write to PTY.
6. Implement `PtyIoHandle::resize(&self, rows: u16, cols: u16) -> Result<(), PtyError>`: lock, resize.

**DONE WHEN**
- [ ] `PtyIoHandle::try_recv()` returns `Some(PtyEvent::Data(...))` containing shell prompt output within 100ms of spawning.
- [ ] Writing a command via `PtyIoHandle::write` and then polling `try_recv` yields the command output.
- [ ] When the shell exits (`exit 0`), `PtyEvent::Exited(0)` is eventually received.

---

### Task 16 (A) +vt
**PURPOSE** — VT100/xterm escape sequence parser: interprets the byte stream from the PTY into structured terminal operations (print char, move cursor, set color, clear screen, etc.).

**WHAT TO DO**
1. Create `walk-core/src/vt_parser.rs`. Implement a state machine based on Paul Falkenstein Williams' VT parser state diagram. Define states: `Ground`, `Escape`, `EscapeIntermediate`, `CsiEntry`, `CsiParam`, `CsiIntermediate`, `CsiIgnore`, `OscString`, `DcsEntry`, `DcsParam`, `DcsIntermediate`, `DcsPassthrough`, `DcsIgnore`, `SosPmApcString`.
2. Define `VtAction` enum with variants: `Print(char)`, `Execute(u8)` (C0 control codes), `CsiDispatch { params: Vec<u16>, intermediates: Vec<u8>, final_char: char }`, `EscDispatch { intermediates: Vec<u8>, final_char: char }`, `OscDispatch(Vec<Vec<u8>>)`, `DcsHook/DcsPut/DcsUnhook`, `PutChar(char)`.
3. Implement `VtParser` struct: `{ state: State, params: Vec<u16>, intermediates: Vec<u8>, current_param: u16, osc_raw: Vec<u8> }`.
4. Implement `VtParser::advance(&mut self, byte: u8) -> Vec<VtAction>`: the core state machine transition function. Each byte triggers a state transition and possibly emits one or more `VtAction`s.
5. Handle UTF-8: accumulate multi-byte sequences in Ground state and emit `Print(char)` only when a complete codepoint is decoded. Use a `utf8_buf: [u8; 4]` and `utf8_len: usize` in the parser.

**DONE WHEN**
- [ ] Feeding `b"Hello"` produces 5 `VtAction::Print` actions for 'H','e','l','l','o'.
- [ ] Feeding `b"\x1b[31m"` (red foreground) produces `CsiDispatch { params: [31], intermediates: [], final_char: 'm' }`.
- [ ] Feeding `b"\x1b[2J"` (clear screen) produces `CsiDispatch { params: [2], intermediates: [], final_char: 'J' }`.
- [ ] Feeding `b"\xc3\xa9"` (UTF-8 'é') produces `Print('é')`.
- [ ] Feeding a broken escape sequence like `b"\x1b[999z"` is handled without panic (absorbed or ignored).

---

### Task 17 (A) +vt
**PURPOSE** — Terminal screen buffer: stores the grid of character cells and cursor position, and applies VT actions from the parser to mutate screen state.

**WHAT TO DO**
1. Create `walk-core/src/screen.rs`. Define `Cell { char: char, fg: Color, bg: Color, attrs: CellAttrs }` where `CellAttrs` is a bitflags struct: `BOLD | ITALIC | UNDERLINE | STRIKETHROUGH | BLINK | INVERSE | HIDDEN | DIM`.
2. Define `Screen` struct: `{ cells: Vec<Vec<Cell>>, rows: u16, cols: u16, cursor: CursorState, scroll_region: (u16, u16), saved_cursor: Option<CursorState>, alternate_screen: Option<Vec<Vec<Cell>>> }` where `CursorState { row: u16, col: u16, fg: Color, bg: Color, attrs: CellAttrs, visible: bool }`.
3. Implement screen manipulation methods:
   - `put_char(c: char)`: write char at cursor position with current attrs, advance cursor, handle line wrap.
   - `move_cursor(row: u16, col: u16)`: CUP (CSI H).
   - `move_cursor_relative(dr: i16, dc: i16)`: for CUU/CUD/CUF/CUB.
   - `erase_in_display(mode: u16)`: ED (CSI J) — 0=below, 1=above, 2=all, 3=all+scrollback.
   - `erase_in_line(mode: u16)`: EL (CSI K).
   - `insert_lines(n: u16)`, `delete_lines(n: u16)`: IL/DL within scroll region.
   - `scroll_up(n: u16)`, `scroll_down(n: u16)`: scroll content within scroll region.
   - `set_scroll_region(top: u16, bottom: u16)`: DECSTBM.
   - `set_sgr(params: &[u16])`: parse SGR parameters to set fg/bg colors (standard 8, bright 8, 256-color via `38;5;n`, truecolor via `38;2;r;g;b`) and attributes.
   - `save_cursor()`, `restore_cursor()`: DECSC/DECRC.
   - `switch_to_alternate_screen()`, `switch_to_main_screen()`: for programs like vim/less.
4. Implement `Screen::apply_action(&mut self, action: &VtAction)` that dispatches VtActions to the above methods. Handle `Execute` for C0 codes: `\n` (LF), `\r` (CR), `\t` (HT — advance to next 8-column tab stop), `\x08` (BS — move cursor left), `\x07` (BEL — ignore or emit event).

**DONE WHEN**
- [ ] After `put_char('A')` at (0,0), `cells[0][0].char == 'A'` and cursor is at (0,1).
- [ ] After `set_sgr([38, 5, 196])`, new chars are written with 256-color red foreground.
- [ ] `erase_in_display(2)` sets all cells to blank space with default colors.
- [ ] `switch_to_alternate_screen()` preserves main buffer; `switch_to_main_screen()` restores it.
- [ ] Writing 81 chars on an 80-column screen wraps to the next line.

---

### Task 18 (A) +vt
**PURPOSE** — Scrollback buffer: stores lines that scroll off the top of the visible screen so the user can scroll back through history.

**WHAT TO DO**
1. In `walk-core/src/scrollback.rs`, create `ScrollbackBuffer` struct: `{ lines: VecDeque<Vec<Cell>>, max_lines: usize }`.
2. Implement `ScrollbackBuffer::new(max_lines: usize) -> Self` with default max of 10,000.
3. Implement `push(&mut self, line: Vec<Cell>)`: push to back, pop from front if over capacity.
4. Implement `get(&self, index: usize) -> Option<&Vec<Cell>>`: index 0 = most recent scrolled-off line.
5. Implement `len(&self) -> usize`, `clear(&mut self)`, `search(&self, query: &str) -> Vec<usize>` (returns indices of lines containing the query substring).
6. Integrate with `Screen`: when `scroll_up` is called and lines leave the top of the screen, push them to `ScrollbackBuffer`. When switching to alternate screen, pause scrollback accumulation.

**DONE WHEN**
- [ ] After scrolling 50 lines off the top of a 24-row screen, `scrollback.len() == 50`.
- [ ] `scrollback.get(0)` returns the most recently scrolled-off line.
- [ ] With `max_lines = 100`, pushing 150 lines results in `len() == 100` and the oldest 50 are gone.
- [ ] `search("error")` returns the indices of all lines containing the substring "error" (case-sensitive).

---

### Task 19 (A) +vt
**PURPOSE** — Connects the PTY async reader to the VT parser and screen, forming the core data pipeline: bytes → parser → actions → screen mutations.

**WHAT TO DO**
1. In `walk-core/src/terminal.rs`, create `Terminal` struct: `{ screen: Screen, scrollback: ScrollbackBuffer, parser: VtParser, pty: PtyIoHandle, title: String, dirty: bool }`.
2. Implement `Terminal::new(config: &TerminalConfig) -> Result<Self, TerminalError>`: create PTY with shell from config, create Screen with rows/cols, create empty scrollback, create parser.
3. Implement `Terminal::process_pty_output(&mut self)`: call `self.pty.try_recv()` in a loop (up to 64 iterations per frame to avoid stalling the render). For each `PtyEvent::Data(bytes)`, feed each byte to `parser.advance()`, then apply each resulting `VtAction` to `self.screen`. Set `self.dirty = true` if any actions were applied.
4. Implement `Terminal::send_input(&self, data: &[u8])`: writes to the PTY.
5. Implement `Terminal::resize(&mut self, rows: u16, cols: u16)`: resize screen, resize PTY, reflow content.
6. Implement `Terminal::is_dirty(&self) -> bool` and `Terminal::mark_clean(&mut self)`.

**DONE WHEN**
- [ ] Creating a `Terminal` with bash spawns a shell and `process_pty_output` yields a visible prompt in `screen.cells`.
- [ ] Calling `send_input(b"ls\n")` and then `process_pty_output` results in `ls` output appearing in the screen cells.
- [ ] `is_dirty()` returns true after new output arrives and false after `mark_clean()`.

---

## Phase 4: Shell Integration (+shell)

### Task 20 (A) +shell
**PURPOSE** — Shell detection and configuration: automatically detects the user's default shell and provides correct initialization arguments for each supported shell.

**WHAT TO DO**
1. Create `walk-core/src/shell.rs`. Define `ShellType` enum: `Bash`, `Zsh`, `Fish`, `PowerShell`, `Wsl(String)` (String = distro name).
2. Implement `fn detect_default_shell() -> ShellType`:
   - On Unix: read `$SHELL` env var, parse the basename. If unset, fall back to `/etc/passwd` entry for current user.
   - On Windows: default to `PowerShell`. Check registry `HKCU\Software\Walk\DefaultShell` for overrides.
3. Implement `fn shell_spawn_config(shell: &ShellType) -> PtyConfig`:
   - Bash: `shell="/bin/bash"`, `args=["--login"]`, set `TERM=xterm-256color`.
   - Zsh: `shell="/bin/zsh"`, `args=["--login"]`, set `TERM=xterm-256color`.
   - Fish: `shell="/usr/bin/fish"`, `args=["--login"]`, set `TERM=xterm-256color`.
   - PowerShell: `shell="powershell.exe"`, `args=["-NoLogo"]`, set `TERM=xterm-256color`.
   - Wsl(distro): `shell="wsl.exe"`, `args=["-d", &distro, "--", "bash", "--login"]`.
4. Implement `fn available_shells() -> Vec<ShellType>`: scans the system for available shells (check `/etc/shells` on Unix, check PATH for powershell/wsl on Windows).

**DONE WHEN**
- [ ] On a macOS system with zsh as default, `detect_default_shell()` returns `Zsh`.
- [ ] `shell_spawn_config(&ShellType::Bash)` returns a `PtyConfig` where `shell` is a valid path to bash and `TERM` is set.
- [ ] `available_shells()` returns at least one shell on every supported platform.

---

### Task 21 (B) +shell
**PURPOSE** — Shell integration scripts: injects lightweight shell hooks that enable Walk-specific features like Block boundary detection (marking where commands start and end) and current working directory tracking.

**WHAT TO DO**
1. Create `walk-core/src/shell_integration/` directory with files: `bash.sh`, `zsh.sh`, `fish.fish`, `pwsh.ps1`.
2. For each shell, write a minimal integration script that:
   - Emits OSC 133 sequences for command prompt semantics: `\033]133;A\007` before prompt, `\033]133;B\007` after prompt (before command execution), `\033]133;C\007` before command output, `\033]133;D;$?\007` after command completes (with exit code).
   - Emits OSC 7 (`\033]7;file://<hostname><cwd>\007`) after each `cd` to report the current working directory.
3. **Bash**: use `PROMPT_COMMAND` and `PS0` to emit markers. Source via `--rcfile` or by appending to a temp file that sources `~/.bashrc` first.
4. **Zsh**: use `precmd` and `preexec` hook functions. Source via `ZDOTDIR` override pointing to a temp dir with a `.zshrc` that sources the user's original and then the integration.
5. **Fish**: use `fish_prompt` and `fish_preexec`/`fish_postexec` event handlers. Source via `--init-command`.
6. **PowerShell**: override `prompt` function and use `Register-EngineEvent PowerShell.OnIdle` or `PSConsoleHostReadLine`. Source via `-Command` flag.
7. Embed all scripts as `include_str!()` constants in `walk-core/src/shell_integration/mod.rs`. Implement `fn integration_args(shell: &ShellType) -> Vec<String>` that returns the extra args needed to inject the integration script.

**DONE WHEN**
- [ ] In a Walk+bash session, the raw PTY output contains `\033]133;A` before the prompt and `\033]133;B` immediately after the user presses Enter.
- [ ] In a Walk+zsh session, `cd /tmp` causes `\033]7;file://<host>/tmp\007` to appear in the PTY output.
- [ ] Integration scripts do not break normal shell operation: `.bashrc`, `.zshrc`, `config.fish` still load, aliases and functions work.

---

### Task 22 (B) +shell
**PURPOSE** — Parse OSC 133 semantic markers from the PTY output stream to identify command boundaries, enabling the Blocks feature (Phase 5).

**WHAT TO DO**
1. In `walk-core/src/vt_parser.rs`, extend the `OscDispatch` handling to detect OSC 133 sequences. When `OscDispatch` fires with first param `133`, parse the second param as the marker type: `A` (prompt start), `B` (command start), `C` (output start), `D` (command end, optional exit code).
2. Define `SemanticEvent` enum in `walk-core/src/semantic.rs`: `PromptStart { line: u16 }`, `CommandStart { line: u16 }`, `OutputStart { line: u16 }`, `CommandEnd { line: u16, exit_code: Option<i32> }`, `CwdChanged(PathBuf)`.
3. Extend `Terminal::process_pty_output` to detect these and emit them via a new `events: Vec<SemanticEvent>` field on `Terminal`, drained each frame.
4. Also parse OSC 7 (CWD reporting) and emit `CwdChanged`.

**DONE WHEN**
- [ ] Running `ls` in a Walk+bash session emits the sequence: `PromptStart` → `CommandStart` → `OutputStart` → `CommandEnd { exit_code: Some(0) }`.
- [ ] Running `cd /tmp` emits `CwdChanged("/tmp")`.
- [ ] A command that fails (`false`) emits `CommandEnd { exit_code: Some(1) }`.

---

## Phase 5: Blocks (+blocks)

### Task 23 (A) +blocks
**PURPOSE** — Block data model: represents each command-output pair as a navigable, self-contained "Block" that is the core UX differentiator from traditional terminals.

**WHAT TO DO**
1. Create `walk-core/src/block.rs`. Define `Block` struct: `{ id: u64, prompt_text: String, command_text: String, output_lines: Vec<Vec<Cell>>, exit_code: Option<i32>, start_time: Instant, end_time: Option<Instant>, is_collapsed: bool, scroll_offset: usize }`.
2. Define `BlockManager` struct: `{ blocks: Vec<Block>, active_block: Option<u64>, next_id: u64, state: BlockBuildState }` where `BlockBuildState` enum: `WaitingForPrompt`, `InPrompt { start_line: u16 }`, `InCommand { prompt_text: String }`, `InOutput { block_id: u64 }`.
3. Implement `BlockManager::handle_event(&mut self, event: &SemanticEvent, screen: &Screen)`:
   - `PromptStart`: transition to `InPrompt`, record start line.
   - `CommandStart`: capture prompt text from screen lines between prompt start and current line, transition to `InCommand`.
   - `OutputStart`: create a new `Block` with the captured command text, transition to `InOutput`.
   - `CommandEnd`: finalize the active block with exit code and `end_time`.
4. Implement `BlockManager::get_block(&self, id: u64) -> Option<&Block>`.
5. Implement `BlockManager::visible_blocks(&self) -> &[Block]`: returns blocks that should be rendered in the current viewport.
6. Each frame, call `output_lines.push(...)` for lines produced while in `InOutput` state.

**DONE WHEN**
- [ ] After running `echo hello`, `BlockManager` contains one completed Block with `command_text == "echo hello"`, `output_lines` containing the "hello" output, and `exit_code == Some(0)`.
- [ ] After running 3 commands, `blocks.len() == 3` with correct ordering.
- [ ] A block for `false` has `exit_code == Some(1)`.

---

### Task 24 (A) +blocks
**PURPOSE** — Block navigation: keyboard shortcuts to jump between blocks, select blocks, and copy block content.

**WHAT TO DO**
1. In `walk-core/src/block_nav.rs`, implement `BlockNavigator` struct: `{ selected_block_index: Option<usize>, block_manager: BlockManager }`.
2. Implement navigation keybindings (to be wired in the keybinding system later):
   - `Cmd/Ctrl+Up`: select previous block (decrement `selected_block_index`).
   - `Cmd/Ctrl+Down`: select next block.
   - `Cmd/Ctrl+Shift+C`: copy selected block's output to clipboard (full text).
   - `Cmd/Ctrl+Shift+Up`: select from current block to the first block.
   - `Enter` on a selected block: re-run the block's command (send command text to PTY).
3. Implement `BlockNavigator::selected_block(&self) -> Option<&Block>`.
4. Implement `BlockNavigator::toggle_collapse(&mut self)`: collapse/expand the selected block's output.
5. Visual state: when a block is selected, the renderer should draw a highlight border around it. Add `is_selected: bool` to the block rendering data.

**DONE WHEN**
- [ ] After running 5 commands, pressing Cmd+Up 3 times selects the 3rd-from-last block.
- [ ] Pressing Cmd+Down from the first block selects the second block.
- [ ] Copy block (Cmd+Shift+C) on a selected block writes the output text to the system clipboard (verified by pasting elsewhere).
- [ ] Toggle collapse hides the block's output lines and re-expand shows them.

---

### Task 25 (B) +blocks
**PURPOSE** — Search within a Block: allows the user to search for text within a specific block's output, with match highlighting and navigation.

**WHAT TO DO**
1. In `walk-core/src/block_search.rs`, create `BlockSearch` struct: `{ query: String, matches: Vec<SearchMatch>, current_match: usize, target_block_id: u64 }` where `SearchMatch { line: usize, col_start: usize, col_end: usize }`.
2. Implement `BlockSearch::new(block: &Block, query: &str) -> Self`: scan all `output_lines` for substring matches (case-insensitive). Populate `matches`.
3. Implement `BlockSearch::next_match(&mut self) -> Option<&SearchMatch>`: advance `current_match`, wrapping at end.
4. Implement `BlockSearch::prev_match(&mut self) -> Option<&SearchMatch>`.
5. Implement `BlockSearch::highlight_ranges(&self) -> Vec<(usize, usize, usize)>`: returns `(line, col_start, col_end)` tuples for the renderer to overlay highlights on matching text (yellow background for all matches, orange for the current match).
6. Keybinding: `Cmd/Ctrl+F` while a block is selected enters block-search mode. `Enter` = next match, `Shift+Enter` = previous, `Escape` = exit search.

**DONE WHEN**
- [ ] Searching "error" in a block containing 3 lines with "error" returns `matches.len() == 3`.
- [ ] `next_match` cycles through all matches and wraps to the first after the last.
- [ ] `highlight_ranges` returns correct `(line, col_start, col_end)` tuples that correspond to the actual positions of "error" in the output.

---

## Phase 6: Input Editor (+input)

### Task 26 (A) +input
**PURPOSE** — Core text buffer for the input editor: a rope-like data structure that supports efficient multi-cursor editing, insertions, and deletions.

**WHAT TO DO**
1. Create `walk-ui/src/input/buffer.rs`. Implement `InputBuffer` struct using a gap buffer: `{ text: Vec<char>, gap_start: usize, gap_end: usize, cursors: Vec<Cursor> }` where `Cursor { position: usize, anchor: Option<usize> }` (anchor is set when there's a selection; the selection range is `min(position, anchor)..max(position, anchor)`).
2. Implement `InputBuffer::new() -> Self` with initial capacity of 1024 chars, gap size 256.
3. Implement `insert_at(&mut self, cursor_idx: usize, text: &str)`: move gap to cursor position, insert chars, advance cursor and adjust all cursors after it.
4. Implement `delete_range(&mut self, start: usize, end: usize)`: collapse range, adjust cursors.
5. Implement `text(&self) -> String`: return the full text content (excluding gap).
6. Implement `line_count(&self) -> usize`, `line_text(&self, line: usize) -> &str`, `cursor_positions(&self) -> Vec<(usize, usize)>` (row, col).
7. Implement multi-cursor support: `add_cursor(&mut self, position: usize)`, `remove_cursor(&mut self, idx: usize)`. When inserting/deleting, apply the operation at every cursor, adjusting positions after each application.

**DONE WHEN**
- [ ] `insert_at(0, "hello")` then `text()` returns `"hello"`, cursor is at position 5.
- [ ] With two cursors at positions 0 and 5 in `"helloworld"`, inserting `"_"` at both produces `"_hello_world"`.
- [ ] `delete_range(2, 4)` on `"abcdef"` produces `"abef"`.
- [ ] `line_count()` returns 3 for `"a\nb\nc"`.

---

### Task 27 (A) +input
**PURPOSE** — Input editor cursor movement: implements all VS Code-style cursor motions including word boundaries, line start/end, and selection extension.

**WHAT TO DO**
1. In `walk-ui/src/input/cursor_ops.rs`, implement cursor movement functions that operate on `InputBuffer`:
   - `move_left(buf, cursor_idx, extend_selection: bool)`: move one char left. If `extend_selection`, set/maintain anchor; otherwise clear anchor.
   - `move_right(buf, cursor_idx, extend_selection)`: one char right.
   - `move_word_left(buf, cursor_idx, extend_selection)`: jump to previous word boundary (transition from non-alphanumeric to alphanumeric, scanning left).
   - `move_word_right(buf, cursor_idx, extend_selection)`: jump to next word boundary.
   - `move_line_start(buf, cursor_idx, extend_selection)`: move to column 0 of current line, or to first non-whitespace char if already at column 0 (smart home).
   - `move_line_end(buf, cursor_idx, extend_selection)`.
   - `move_up(buf, cursor_idx, extend_selection)`: move to same column on previous line (or clamp).
   - `move_down(buf, cursor_idx, extend_selection)`.
2. Implement `select_all(buf)`: set cursor at end with anchor at 0.
3. Implement `select_word_at(buf, position: usize)`: set anchor and cursor to word boundaries around position.
4. Implement `select_line_at(buf, line: usize)`: select entire line.

**DONE WHEN**
- [ ] In `"hello world"`, cursor at 6, `move_word_left` moves cursor to 0 (start of "hello").
- [ ] In `"  hello"`, cursor at 0, `move_line_start` moves to 2 (first non-space). Pressing again moves to 0.
- [ ] `select_all` on `"abc"` results in selection range `0..3`.
- [ ] `move_down` from middle of line 1 in a 3-line buffer moves to the same column on line 2 (or end of line 2 if shorter).

---

### Task 28 (A) +input
**PURPOSE** — Syntax highlighting for the command input: provides real-time coloring of commands, arguments, paths, strings, and flags as the user types.

**WHAT TO DO**
1. Create `walk-ui/src/input/highlighter.rs`. Define `HighlightSpan { start: usize, end: usize, kind: SpanKind }` and `SpanKind` enum: `Command`, `Argument`, `Flag`, `Path`, `String`, `Number`, `Pipe`, `Redirect`, `Variable`, `Comment`, `Error`, `Default`.
2. Implement `fn highlight(text: &str, shell: &ShellType) -> Vec<HighlightSpan>`:
   - Tokenize by splitting on whitespace, respecting quoted strings (`"..."`, `'...'`).
   - First token = `Command` (check if it exists in PATH for error highlighting — cache PATH lookup results).
   - Tokens starting with `-` or `--` = `Flag`.
   - Tokens containing `/` or `~` = `Path`.
   - Tokens matching `$VARNAME` or `${VAR}` = `Variable`.
   - `|` = `Pipe`, `>`, `>>`, `<` = `Redirect`.
   - Tokens starting with `#` (in bash/zsh/fish) = `Comment` (rest of line).
   - Quoted strings = `String`.
   - Numeric-only tokens = `Number`.
3. Map each `SpanKind` to a `Color` via the active theme (Task 40).

**DONE WHEN**
- [ ] `highlight("git commit -m 'hello'", &Bash)` returns spans: `Command(0..3)`, `Argument(4..10)`, `Flag(11..13)`, `String(14..21)`.
- [ ] `highlight("cat /tmp/file | grep 'err'", &Bash)` correctly identifies `Path`, `Pipe`, `Command(grep)`, `String`.
- [ ] A non-existent command like `highlight("xyznotreal arg", &Bash)` marks `xyznotreal` as `Error`.

---

### Task 29 (B) +input
**PURPOSE** — Bracket matching: highlights the matching bracket/paren/brace when the cursor is adjacent to one, essential for complex command editing.

**WHAT TO DO**
1. In `walk-ui/src/input/brackets.rs`, define bracket pairs: `('(', ')')`, `('[', ']')`, `('{', '}')`.
2. Implement `fn find_matching_bracket(text: &str, position: usize) -> Option<usize>`:
   - If char at `position` (or `position - 1`) is an opening bracket, scan forward with a nesting counter, skipping quoted strings.
   - If it's a closing bracket, scan backward with a nesting counter.
   - Return the position of the matching bracket, or `None` if unmatched.
3. Integrate with the input editor rendering: when cursor is adjacent to a bracket, call `find_matching_bracket`. If a match is found, both brackets should be rendered with a highlight background color (from theme).

**DONE WHEN**
- [ ] In `"echo $(cat file)"`, cursor at position 5 (the `$(`), `find_matching_bracket` returns the position of the closing `)`.
- [ ] Nested brackets: `"echo $((1+2))"` — cursor at outer `(` matches outer `)`.
- [ ] Unmatched `"echo (foo"` returns `None`.
- [ ] Brackets inside quotes are ignored: `"echo '(not a bracket)'"` — cursor at `'(` returns `None`.

---

### Task 30 (B) +input
**PURPOSE** — Multi-line input editing with proper line wrapping display and the ability to toggle input position between top and bottom of the terminal.

**WHAT TO DO**
1. In `walk-ui/src/input/editor.rs`, create `InputEditor` struct: `{ buffer: InputBuffer, highlighter: fn, scroll_offset: usize, position: InputPosition, history: CommandHistory, is_active: bool }` where `InputPosition` enum: `Top`, `Bottom`.
2. Implement `InputEditor::handle_key(&mut self, event: &InputEvent) -> Option<EditorAction>` where `EditorAction` enum: `Submit(String)` (user pressed Enter without Shift), `None`. Map:
   - Regular chars → insert at all cursors.
   - `Shift+Enter` → insert newline (multi-line mode).
   - `Enter` → Submit.
   - `Backspace` → delete before cursor.
   - `Delete` → delete after cursor.
   - Arrow keys (with/without Shift/Ctrl/Alt) → delegate to cursor_ops.
   - `Ctrl+D` on empty buffer → send EOF to PTY.
   - `Tab` → insert literal tab or trigger completion (future).
3. Implement `InputEditor::render_data(&self) -> InputRenderData` containing: all lines of text with syntax highlights, cursor positions, bracket match positions, selection ranges, the `InputPosition`.
4. Implement `InputEditor::set_position(&mut self, pos: InputPosition)`.
5. The renderer (Phase 7) will use `render_data` to draw the input area at the top or bottom of the terminal viewport.

**DONE WHEN**
- [ ] Typing `echo hello` and pressing Enter returns `EditorAction::Submit("echo hello")` and clears the buffer.
- [ ] `Shift+Enter` inserts a newline; buffer contains `"line1\nline2"`.
- [ ] `set_position(Top)` causes `render_data().position` to be `Top`.
- [ ] Multi-cursor editing works end-to-end: `Ctrl+Click` (from mouse handler) adds a cursor; typing inserts at all cursors.

---

### Task 31 (B) +input
**PURPOSE** — Command history: persists and navigates through previously executed commands, shared across sessions via a history file.

**WHAT TO DO**
1. In `walk-ui/src/input/history.rs`, create `CommandHistory` struct: `{ entries: Vec<String>, cursor: usize, history_file: PathBuf, max_entries: usize, search_query: Option<String>, search_results: Vec<usize> }`.
2. Implement `CommandHistory::load(path: &Path, max: usize) -> Self`: read history file (one command per line, most recent last). Default path: `~/.walk_history`.
3. Implement `push(&mut self, command: &str)`: append to entries and to history file. Skip duplicates of the immediately previous entry.
4. Implement `prev(&mut self) -> Option<&str>`: navigate backward (Up arrow). Save the current input buffer as a "future" entry so Down arrow can return to it.
5. Implement `next(&mut self) -> Option<&str>`: navigate forward (Down arrow).
6. Implement `search(&mut self, query: &str) -> Vec<&str>`: reverse search (Ctrl+R style) returning all entries containing the query, most recent first.
7. Implement `save(&self)`: write all entries to history file.
8. Implement `Drop for CommandHistory`: call `save()`.

**DONE WHEN**
- [ ] After executing 3 commands and pressing Up 3 times, the input shows each previous command in reverse order.
- [ ] Pressing Down after Up returns to the next command, and from the most recent returns to the user's partially typed input.
- [ ] `search("git")` returns all history entries containing "git".
- [ ] History persists across application restarts (file exists at `~/.walk_history`).

---

## Phase 7: UI Framework & Layout (+ui)

### Task 32 (A) +ui
**PURPOSE** — Layout engine: a flexbox-inspired layout system that computes positions and sizes for all UI elements (tabs bar, input editor, terminal viewport, status bar, split panes).

**WHAT TO DO**
1. Create `walk-ui/src/layout/mod.rs`. Define `LayoutNode` enum:
   ```rust
   enum LayoutNode {
       Leaf { id: NodeId, min_size: Size, flex: f32 },
       Row { children: Vec<LayoutNode>, gap: f32 },
       Column { children: Vec<LayoutNode>, gap: f32 },
   }
   ```
2. Define `LayoutResult` struct: `{ rects: HashMap<NodeId, Rect> }`.
3. Implement `fn compute_layout(root: &LayoutNode, available: Rect) -> LayoutResult`:
   - For `Row`: distribute `available.w` among children proportional to their `flex` values, respecting `min_size.w`. Each child gets full height.
   - For `Column`: distribute `available.h` among children proportional to `flex`, respecting `min_size.h`. Each child gets full width.
   - For `Leaf`: assign the computed rect to the `id`.
4. Define `NodeId` constants: `TAB_BAR`, `TERMINAL_VIEWPORT`, `INPUT_EDITOR`, `STATUS_BAR`, `SPLIT_DIVIDER`.
5. Implement `fn build_default_layout(input_position: InputPosition) -> LayoutNode`: constructs the column layout. If `InputPosition::Bottom`: TabBar (fixed 32px) → Viewport (flex 1.0) → InputEditor (min 40px, flex 0) → StatusBar (fixed 24px). If `Top`: TabBar → InputEditor → Viewport → StatusBar.

**DONE WHEN**
- [ ] `compute_layout` with a 1200×800 available rect and default bottom layout produces: TabBar at (0,0,1200,32), Viewport at (0,32,1200,704), InputEditor at (0,736,1200,40), StatusBar at (0,776,1200,24).
- [ ] Resizing to 600×400 still allocates correctly with the viewport shrinking.
- [ ] `build_default_layout(Top)` places InputEditor before Viewport.

---

### Task 33 (A) +ui
**PURPOSE** — Tab management: allows multiple terminal sessions as tabs with creation, closing, switching, and drag-to-reorder.

**WHAT TO DO**
1. In `walk-ui/src/tabs.rs`, create `TabManager` struct: `{ tabs: Vec<Tab>, active_tab: usize }` where `Tab { id: u64, title: String, terminal: Terminal, is_dirty: bool }`.
2. Implement `TabManager::new_tab(&mut self, shell: &ShellType) -> u64`: create a new `Terminal` instance, add a `Tab`, make it active, return the id.
3. Implement `close_tab(&mut self, id: u64)`: close the tab's terminal (drop PTY), remove from list, adjust `active_tab`.
4. Implement `switch_tab(&mut self, index: usize)`, `next_tab(&mut self)`, `prev_tab(&mut self)`.
5. Implement `move_tab(&mut self, from: usize, to: usize)`: reorder tabs.
6. Implement `active_terminal(&mut self) -> &mut Terminal`: returns the active tab's terminal.
7. Tab title: default to shell name. Update to current CWD basename when `CwdChanged` events arrive. Update to running process name if available (parse from OSC 0 title-setting sequences).
8. Keybindings: `Cmd/Ctrl+T` = new tab, `Cmd/Ctrl+W` = close tab, `Cmd/Ctrl+Tab` = next tab, `Cmd/Ctrl+Shift+Tab` = prev tab, `Cmd/Ctrl+1-9` = switch to tab N.

**DONE WHEN**
- [ ] `new_tab` creates a tab with a running shell; `close_tab` terminates the shell process.
- [ ] `next_tab` from the last tab wraps to the first.
- [ ] `move_tab(0, 2)` reorders tabs correctly in a 3-tab setup.
- [ ] Tab title updates when `cd /tmp` is run (becomes "tmp").

---

### Task 34 (A) +ui
**PURPOSE** — Split pane management: allows horizontal and vertical splitting of the terminal viewport with resizable dividers.

**WHAT TO DO**
1. In `walk-ui/src/splits.rs`, define a binary tree structure:
   ```rust
   enum SplitNode {
       Leaf { tab_id: u64 },
       Split { direction: SplitDirection, ratio: f32, first: Box<SplitNode>, second: Box<SplitNode> },
   }
   enum SplitDirection { Horizontal, Vertical }
   ```
2. Create `SplitManager` struct: `{ root: SplitNode, focused_leaf: u64 }`.
3. Implement `SplitManager::split_active(&mut self, direction: SplitDirection, new_tab_id: u64)`: replace the focused leaf with a `Split` node containing the old leaf and a new leaf with `new_tab_id`, ratio 0.5.
4. Implement `close_split(&mut self, tab_id: u64)`: remove the leaf, collapse the parent Split into the remaining sibling.
5. Implement `resize_split(&mut self, tab_id: u64, delta: f32)`: adjust the ratio of the parent split, clamping to `[0.1, 0.9]`.
6. Implement `focus_direction(&mut self, direction: Direction)` where `Direction { Left, Right, Up, Down }`: navigate focus to the adjacent pane in the given direction.
7. Implement `compute_rects(&self, available: Rect) -> HashMap<u64, Rect>`: recursively compute the screen rect for each leaf by splitting the available rect according to direction and ratio.
8. Keybindings: `Cmd/Ctrl+D` = split vertical, `Cmd/Ctrl+Shift+D` = split horizontal, `Cmd/Ctrl+Alt+Arrow` = focus direction, `Cmd/Ctrl+Shift+Arrow` = resize split.

**DONE WHEN**
- [ ] Splitting an 800×600 pane vertically produces two 400×600 rects.
- [ ] Splitting horizontally produces two 800×300 rects.
- [ ] `resize_split` with delta +0.1 changes ratio from 0.5 to 0.6, adjusting child rects.
- [ ] `close_split` on one leaf of a 2-pane setup returns to a single leaf with the full rect.
- [ ] Nested splits work: split A vertically, then split the right pane horizontally → 3 panes with correct rects.

---

### Task 35 (A) +ui
**PURPOSE** — Terminal viewport renderer: draws the Screen's cell grid, cursor, and block decorations using the GPU renderer, forming the main visual area of the terminal.

**WHAT TO DO**
1. In `walk-ui/src/viewport.rs`, create `ViewportRenderer` struct: `{ scroll_position: f32, smooth_scroll_target: f32, selection: Option<TextSelection> }` where `TextSelection { start: (u16, u16), end: (u16, u16) }`.
2. Implement `ViewportRenderer::render(&mut self, frame: &mut Frame, renderer: &mut dyn Renderer, terminal: &Terminal, rect: Rect, font: &FontManager, atlas: &mut GlyphAtlas, theme: &Theme)`:
   - Clear the viewport rect with `theme.background_color`.
   - Iterate visible rows of the screen (accounting for scroll position into scrollback).
   - For each cell: if `bg != default`, draw a background rect. Call `draw_glyph` for the char with fg color from the cell style.
   - Draw underline/strikethrough as thin rects if cell attrs include them.
   - Draw the cursor: block cursor = filled rect at cursor position with inverted colors; bar cursor = 2px wide rect; underline cursor = 2px tall rect at baseline.
   - Draw block decorations: if BlockManager has completed blocks visible, draw a left-side color bar (green for exit 0, red for nonzero) and a subtle separator line between blocks.
   - Draw selection highlight: semi-transparent blue overlay rect for selected cells.
3. Implement smooth scrolling: each frame, lerp `scroll_position` toward `smooth_scroll_target` by 0.2.
4. Implement `ViewportRenderer::handle_scroll(&mut self, delta: f32)`: adjust `smooth_scroll_target` (clamped to valid scrollback range).

**DONE WHEN**
- [ ] A screen with "Hello" at row 0, col 0 renders the 5 glyphs at the correct pixel positions.
- [ ] Bold and colored text renders with the correct font variant and color.
- [ ] Cursor is visible and blinks (toggle visibility every 500ms).
- [ ] Scrolling up into scrollback shows historical lines; scrolling down returns to live output.
- [ ] Block separators and exit-code color bars are visible between completed command blocks.

---

### Task 36 (B) +ui
**PURPOSE** — Tab bar renderer: draws the tab strip at the top of the window with active tab highlighting, close buttons, and new-tab button.

**WHAT TO DO**
1. In `walk-ui/src/tab_bar.rs`, create `TabBarRenderer`.
2. Implement `render(&self, frame: &mut Frame, renderer: &mut dyn Renderer, tabs: &TabManager, rect: Rect, font: &FontManager, atlas: &mut GlyphAtlas, theme: &Theme)`:
   - Background: draw a rect with `theme.tab_bar_bg`.
   - For each tab: draw a tab rect. Active tab gets `theme.tab_active_bg`, inactive gets `theme.tab_inactive_bg`. Render tab title text centered in the tab rect, truncated with "…" if too wide.
   - Draw a small "×" close button on hover (tracked via mouse position).
   - Draw a "+" new tab button at the end of the tab strip.
   - If tabs overflow the width, draw left/right scroll arrows.
3. Implement `TabBarRenderer::handle_click(&self, pos: Point, tabs: &mut TabManager) -> Option<TabBarAction>` where `TabBarAction { SwitchTab(usize), CloseTab(u64), NewTab, DragStart(usize) }`.
4. Implement `handle_drag(&self, from: usize, to_pos: Point, tabs: &mut TabManager)`: reorder tabs via drag.

**DONE WHEN**
- [ ] 3 tabs render side by side with the active tab visually distinct.
- [ ] Clicking a tab switches to it.
- [ ] Clicking "×" on a tab closes it.
- [ ] Clicking "+" creates a new tab.
- [ ] More tabs than fit in the width shows scroll indicators.

---

### Task 37 (B) +ui
**PURPOSE** — Status bar renderer: displays current CWD, shell type, git branch (if in a repo), encoding, and line/col position.

**WHAT TO DO**
1. In `walk-ui/src/status_bar.rs`, create `StatusBarRenderer`.
2. Implement `render(&self, frame: &mut Frame, renderer: &mut dyn Renderer, state: &StatusBarState, rect: Rect, font: &FontManager, atlas: &mut GlyphAtlas, theme: &Theme)`:
   - Background: `theme.status_bar_bg`.
   - Left side: shell icon/name + CWD (truncated from left if too long, e.g., "…/src/main.rs").
   - Center: git branch name if available (read from CWD's `.git/HEAD`).
   - Right side: cursor position "Ln X, Col Y" + encoding "UTF-8".
3. Define `StatusBarState { cwd: PathBuf, shell: ShellType, git_branch: Option<String>, cursor_line: u16, cursor_col: u16 }`.
4. Implement `fn detect_git_branch(cwd: &Path) -> Option<String>`: walk up from cwd, find `.git/HEAD`, parse `ref: refs/heads/<branch>`.

**DONE WHEN**
- [ ] Status bar renders CWD, shell name, and cursor position at the correct locations.
- [ ] Git branch shows "main" when CWD is inside a git repo on the main branch.
- [ ] CWD longer than available width truncates with "…" prefix.
- [ ] Git branch shows `None` when not in a git repo.

---

## Phase 8: Theming (+theme)

### Task 38 (A) +theme
**PURPOSE** — Theme data model: defines the complete color and style specification for every visual element of the terminal.

**WHAT TO DO**
1. Create `walk-config/src/theme.rs`. Define `Theme` struct with fields:
   ```rust
   pub struct Theme {
       pub name: String,
       pub background: Color,
       pub foreground: Color,
       pub cursor: Color,
       pub selection: Color,
       pub ansi_colors: [Color; 16],  // standard 8 + bright 8
       pub tab_bar_bg: Color,
       pub tab_active_bg: Color,
       pub tab_inactive_bg: Color,
       pub tab_text: Color,
       pub status_bar_bg: Color,
       pub status_bar_text: Color,
       pub input_bg: Color,
       pub input_text: Color,
       pub block_separator: Color,
       pub block_success_accent: Color,
       pub block_error_accent: Color,
       pub highlight_match: Color,
       pub highlight_current_match: Color,
       pub bracket_match: Color,
       pub syntax: SyntaxColors,
       pub font_family: String,
       pub font_size: f32,
       pub opacity: f32,
       pub background_image: Option<PathBuf>,
   }
   ```
   where `SyntaxColors { command: Color, argument: Color, flag: Color, path: Color, string: Color, number: Color, pipe: Color, redirect: Color, variable: Color, comment: Color, error: Color }`.
2. Implement `Theme::default() -> Self`: a dark theme inspired by Warp's default (dark navy background, light text, teal accents).
3. Implement the standard ANSI 16-color palette as constants.

**DONE WHEN**
- [ ] `Theme::default()` returns a valid theme with all 16 ANSI colors set, `opacity == 1.0`, `font_size == 14.0`.
- [ ] All `Color` fields have alpha values in `[0.0, 1.0]`.

---

### Task 39 (A) +theme
**PURPOSE** — Theme loading from TOML files: allows users to customize the terminal's appearance by providing a TOML theme file.

**WHAT TO DO**
1. Add `toml = "0.8"` and `serde = { version = "1", features = ["derive"] }` to `walk-config/Cargo.toml`.
2. In `walk-config/src/theme_loader.rs`, implement `fn load_theme(path: &Path) -> Result<Theme, ThemeError>`:
   - Read file, parse as TOML.
   - Deserialize into a `ThemeToml` struct (all fields optional) using `serde::Deserialize`.
   - Merge with `Theme::default()`: for each field in `ThemeToml`, if `Some`, override the default.
3. Define the TOML schema:
   ```toml
   name = "My Theme"
   background = "#1a1b26"
   foreground = "#c0caf5"
   cursor = "#f7768e"
   opacity = 0.95
   font_family = "JetBrains Mono"
   font_size = 14.0
   [ansi]
   black = "#15161e"
   red = "#f7768e"
   # ... etc
   [syntax]
   command = "#7aa2f7"
   # ... etc
   ```
4. Implement `fn discover_themes(config_dir: &Path) -> Vec<PathBuf>`: scan `<config_dir>/themes/` for `.toml` files.
5. Support hex color strings (`#RRGGBB`, `#RRGGBBAA`) with `fn parse_hex_color(s: &str) -> Result<Color, ThemeError>`.

**DONE WHEN**
- [ ] A valid TOML theme file loads and overrides the default background color.
- [ ] A TOML file with only `background` set results in a theme where all other fields match the default.
- [ ] `parse_hex_color("#ff0000")` returns `Color { r: 1.0, g: 0.0, b: 0.0, a: 1.0 }`.
- [ ] `parse_hex_color("#ff000080")` returns `Color { ..., a: 0.502 }`.
- [ ] An invalid TOML file returns `Err(ThemeError::Parse(...))`.

---

### Task 40 (B) +theme
**PURPOSE** — Theme hot-reloading: watches the active theme file for changes and applies updates without restarting the terminal.

**WHAT TO DO**
1. Add `notify = "6"` to `walk-config/Cargo.toml` (cross-platform filesystem watcher).
2. In `walk-config/src/theme_watcher.rs`, create `ThemeWatcher` struct: `{ watcher: RecommendedWatcher, rx: Receiver<notify::Result<Event>>, active_path: PathBuf }`.
3. Implement `ThemeWatcher::new(theme_path: &Path) -> Result<Self, ThemeError>`: create a `notify` watcher watching the theme file for `Modify` events.
4. Implement `ThemeWatcher::poll(&self) -> Option<Theme>`: non-blocking check for file change events. If changed, reload the theme via `load_theme`, return `Some(theme)`. If the reload fails, log the error and return `None` (keep the old theme).
5. Integrate into the main app loop: each frame, call `theme_watcher.poll()`. If `Some(new_theme)`, update the active theme, invalidate the glyph atlas if font changed, and trigger a full re-render.

**DONE WHEN**
- [ ] Editing and saving the theme TOML file while Walk is running causes the UI to update colors within 1 second.
- [ ] Changing `font_size` in the theme triggers atlas rebuild and re-render at the new size.
- [ ] A syntax error in the theme TOML does not crash the app; the old theme persists and an error is logged to stderr.

---

### Task 41 (B) +theme
**PURPOSE** — Background image and transparency support: renders a user-specified background image behind the terminal content with configurable opacity.

**WHAT TO DO**
1. In `walk-ui/src/background.rs`, create `BackgroundRenderer` struct: `{ texture_id: Option<TextureId>, image_size: (u32, u32) }`.
2. Implement `BackgroundRenderer::load_image(&mut self, path: &Path, renderer: &mut dyn Renderer) -> Result<(), BackgroundError>`: read image file using `image = "0.25"` crate, decode to RGBA8 pixels, upload to GPU via `renderer.create_texture()`.
3. Implement `BackgroundRenderer::render(&self, frame: &mut Frame, renderer: &mut dyn Renderer, viewport: Rect, opacity: f32)`:
   - If no image: skip (clear color handles background).
   - If image loaded: draw a full-viewport textured quad with the image, scaled to cover (maintaining aspect ratio, cropping overflow). Apply `opacity` to the image.
4. Window transparency: on macOS, set `NSWindow.isOpaque = false` and `NSWindow.backgroundColor = NSColor.clear`. On Linux, request an ARGB visual. On Windows, use `DwmExtendFrameIntoClientArea` or `SetLayeredWindowAttributes`.
5. Integrate: render background image first, then render terminal content on top. When `theme.opacity < 1.0`, the window itself is transparent and the terminal content is rendered with semi-transparent background rects.

**DONE WHEN**
- [ ] Setting `background_image = "/path/to/image.png"` in theme displays the image behind terminal text.
- [ ] Setting `opacity = 0.8` makes the window 20% transparent, showing the desktop behind.
- [ ] An invalid image path logs an error but doesn't crash; terminal renders normally without a background image.
- [ ] Resizing the window rescales the background image correctly.

---

## Phase 9: Configuration & Keybindings (+config)

### Task 42 (A) +config
**PURPOSE** — Configuration file system: loads, validates, and provides typed access to all Walk settings from a TOML config file.

**WHAT TO DO**
1. In `walk-config/src/config.rs`, define `WalkConfig` struct:
   ```rust
   pub struct WalkConfig {
       pub shell: ShellType,
       pub theme_path: Option<PathBuf>,
       pub font_family: String,
       pub font_size: f32,
       pub input_position: InputPosition,
       pub scrollback_lines: usize,
       pub cursor_style: CursorStyle,  // Block, Bar, Underline
       pub cursor_blink: bool,
       pub tab_bar_visible: bool,
       pub status_bar_visible: bool,
       pub window_opacity: f32,
       pub background_image: Option<PathBuf>,
       pub copy_on_select: bool,
       pub confirm_close_with_running_process: bool,
       pub keybindings: KeybindingConfig,
   }
   ```
2. Implement `WalkConfig::load() -> Self`:
   - Search for config file at: `$WALK_CONFIG`, then `~/.config/walk/config.toml`, then `~/.walk.toml`.
   - Parse TOML, deserialize with `serde`, merge with `WalkConfig::default()`.
   - If no config file found, use defaults.
3. Implement `WalkConfig::default()`: sensible defaults (14px JetBrains Mono, auto-detected shell, 10000 scrollback, block cursor, bottom input).
4. Implement `WalkConfig::config_dir() -> PathBuf`: `~/.config/walk/` on Unix, `%APPDATA%\Walk\` on Windows.

**DONE WHEN**
- [ ] `WalkConfig::load()` with no config file returns defaults without error.
- [ ] A config file with `font_size = 18` results in `config.font_size == 18.0` with all other fields defaulted.
- [ ] An invalid TOML file produces a meaningful error message.
- [ ] `config_dir()` returns platform-appropriate paths.

---

### Task 43 (A) +config
**PURPOSE** — Keybinding system: maps key combinations to actions with user-overridable defaults, supporting both global and context-specific bindings.

**WHAT TO DO**
1. In `walk-config/src/keybindings.rs`, define `Action` enum with all bindable actions:
   ```rust
   pub enum Action {
       NewTab, CloseTab, NextTab, PrevTab, SwitchToTab(u8),
       SplitVertical, SplitHorizontal, CloseSplit,
       FocusLeft, FocusRight, FocusUp, FocusDown,
       ResizeSplitLeft, ResizeSplitRight, ResizeSplitUp, ResizeSplitDown,
       Copy, Paste, SelectAll,
       ScrollUp, ScrollDown, ScrollPageUp, ScrollPageDown, ScrollToTop, ScrollToBottom,
       BlockPrev, BlockNext, BlockCopy, BlockCollapse, BlockSearch,
       SearchInBlock, SearchGlobal,
       ToggleInputPosition,
       ZoomIn, ZoomOut, ZoomReset,
       ClearScreen,
       SendEof,
   }
   ```
2. Define `KeyCombo { key: KeyAction, modifiers: Modifiers }` and `KeybindingConfig { bindings: HashMap<KeyCombo, Action>, context_bindings: HashMap<Context, HashMap<KeyCombo, Action>> }` where `Context` enum: `Terminal`, `InputEditor`, `BlockSelected`, `SearchActive`.
3. Implement `KeybindingConfig::default() -> Self`: populate with all default keybindings (Cmd/Ctrl+T = NewTab, Cmd/Ctrl+W = CloseTab, etc., adjusting modifier for platform).
4. Implement `KeybindingConfig::resolve(&self, combo: &KeyCombo, context: &Context) -> Option<Action>`: check context bindings first, fall back to global.
5. Implement TOML deserialization:
   ```toml
   [keybindings]
   "ctrl+t" = "new_tab"
   "ctrl+shift+d" = "split_horizontal"
   ```
6. Parse key combo strings: `"ctrl+shift+a"` → `KeyCombo { key: Char('a'), modifiers: { ctrl: true, shift: true, .. } }`.

**DONE WHEN**
- [ ] Default keybindings include all actions listed in the `Action` enum.
- [ ] `resolve(Ctrl+T, Terminal)` returns `Some(Action::NewTab)`.
- [ ] A user config overriding `"ctrl+t" = "split_vertical"` causes `resolve(Ctrl+T, Terminal)` to return `SplitVertical`.
- [ ] Parsing `"cmd+shift+k"` on macOS produces correct `KeyCombo` with `meta: true, shift: true`.

---

### Task 44 (B) +config
**PURPOSE** — Font zoom: allows runtime font size adjustment with keyboard shortcuts, scaling all text and recomputing the cell grid.

**WHAT TO DO**
1. In `walk-ui/src/zoom.rs`, create `ZoomManager` struct: `{ base_size: f32, current_size: f32, min_size: f32, max_size: f32, step: f32 }`.
2. Implement `ZoomManager::new(base: f32) -> Self`: min 8.0, max 32.0, step 1.0.
3. Implement `zoom_in(&mut self)`: increase `current_size` by `step`, clamp to max.
4. Implement `zoom_out(&mut self)`: decrease by step, clamp to min.
5. Implement `zoom_reset(&mut self)`: reset to `base_size`.
6. When zoom changes: recalculate `FontManager` metrics, clear glyph atlas, recompute screen dimensions (new rows/cols based on viewport size / new cell size), resize all PTYs.

**DONE WHEN**
- [ ] `zoom_in` from 14.0 produces 15.0.
- [ ] `zoom_in` at 32.0 stays at 32.0.
- [ ] `zoom_reset` from any size returns to the config's `font_size`.
- [ ] After zoom, the terminal grid recalculates: a 800×600 viewport at 16px cell width has 50 cols (not the 80 it had at ~10px).

---

## Phase 10: Prompt Framework Support (+prompt)

### Task 45 (B) +prompt
**PURPOSE** — Detect and support popular prompt frameworks (Starship, Powerlevel10k, Oh-my-Posh) so their styled prompts render correctly in Walk.

**WHAT TO DO**
1. In `walk-core/src/prompt.rs`, create `PromptDetector`.
2. Implement `fn detect_prompt_framework(shell: &ShellType) -> Option<PromptFramework>` where `PromptFramework` enum: `Starship`, `P10k`, `OhMyPosh`, `OhMyZsh`, `Spaceship`, `Custom`.
   - Check for `starship` in PATH → Starship.
   - Check for `POWERLEVEL9K_*` or `P10K_*` env vars or `.p10k.zsh` in home → P10k.
   - Check for `oh-my-posh` in PATH → OhMyPosh.
   - Check for `$ZSH` env var pointing to oh-my-zsh → OhMyZsh.
3. Ensure the VT parser and screen correctly handle the escape sequences these frameworks emit:
   - Starship: standard ANSI + OSC sequences. Already handled by Tasks 16-17.
   - P10k: uses `%{...%}` zsh prompt escapes which the shell expands before sending to PTY. Needs correct handling of right-aligned prompt sequences (CSI `...G` to move cursor to column).
   - Oh-my-Posh: similar to Starship, uses ANSI sequences.
4. Implement `fn configure_env_for_prompt(framework: &PromptFramework) -> HashMap<String, String>`: set `TERM=xterm-256color`, `COLORTERM=truecolor` to enable full color support. For Starship, set `STARSHIP_SHELL` if not set.

**DONE WHEN**
- [ ] With Starship installed, the prompt renders with correct colors, icons (if font supports them), and segments.
- [ ] P10k's right-aligned prompt content appears at the correct column (right edge of terminal).
- [ ] Prompt frameworks detect correctly on a system where they're installed.
- [ ] `COLORTERM=truecolor` is set in the PTY environment, enabling 24-bit color prompts.

---

## Phase 11: Clipboard & Selection (+clipboard)

### Task 46 (A) +clipboard
**PURPOSE** — System clipboard integration: enables copy and paste between Walk and other applications on all platforms.

**WHAT TO DO**
1. Add `arboard = "3"` to `walk-ui/Cargo.toml` (cross-platform clipboard crate).
2. In `walk-ui/src/clipboard.rs`, create `ClipboardManager` struct wrapping `arboard::Clipboard`.
3. Implement `ClipboardManager::copy(&mut self, text: &str) -> Result<(), ClipboardError>`: set system clipboard text.
4. Implement `ClipboardManager::paste(&mut self) -> Result<String, ClipboardError>`: get system clipboard text.
5. Integrate with keybindings:
   - `Cmd/Ctrl+C` (when text is selected in viewport): extract selected text from screen cells, call `copy()`.
   - `Cmd/Ctrl+C` (when no text selected): send `\x03` (SIGINT) to PTY.
   - `Cmd/Ctrl+V`: call `paste()`, send result to PTY via `terminal.send_input(text.as_bytes())`. Handle bracketed paste mode: if terminal has requested it (via `\033[?2004h`), wrap pasted text in `\033[200~...\033[201~`.
   - `Cmd/Ctrl+Shift+C`: always copy (even if nothing selected, copy current block output).

**DONE WHEN**
- [ ] Selecting text in the viewport and pressing Cmd+C puts the text on the system clipboard (verified by pasting in another app).
- [ ] Cmd+V pastes clipboard content into the terminal as if typed.
- [ ] Cmd+C with no selection sends SIGINT (verified by interrupting a `sleep 100` command).
- [ ] Bracketed paste mode wraps pasted content correctly when enabled by the shell.

---

### Task 47 (B) +clipboard
**PURPOSE** — Mouse-based text selection: click-and-drag to select text in the terminal viewport, with word and line selection on double/triple click.

**WHAT TO DO**
1. In `walk-ui/src/selection.rs`, create `SelectionManager` struct: `{ state: SelectionState, last_click: Option<(Instant, Point)> }` where `SelectionState` enum: `None`, `Selecting { start: CellPos, end: CellPos }`, `Selected { start: CellPos, end: CellPos }` and `CellPos { row: u16, col: u16 }`.
2. Implement `handle_mouse_down(&mut self, pos: Point, cell_size: (f32, f32)) -> SelectionState`: convert pixel position to cell position. Set `state = Selecting { start, end: start }`. Detect double-click (< 300ms since last click at same position) → select word. Detect triple-click → select line.
3. Implement `handle_mouse_drag(&mut self, pos: Point, cell_size: (f32, f32))`: update `end` of selection.
4. Implement `handle_mouse_up(&mut self) -> SelectionState`: transition from `Selecting` to `Selected`.
5. Implement `selected_text(&self, screen: &Screen, scrollback: &ScrollbackBuffer) -> String`: extract text from cells in the selection range, handling line wraps and trimming trailing whitespace per line.
6. If `config.copy_on_select` is true, automatically copy to clipboard on mouse-up.

**DONE WHEN**
- [ ] Click-and-drag selects text; the selected region is visually highlighted in the viewport.
- [ ] Double-click on "hello" selects the entire word.
- [ ] Triple-click selects the entire line.
- [ ] `selected_text` returns the correct string including text that spans multiple lines.
- [ ] Selection across scrollback content works correctly.

---

## Phase 12: Global Search (+search)

### Task 48 (B) +search
**PURPOSE** — Global terminal search: search across all terminal output (scrollback + visible screen) with match highlighting and navigation.

**WHAT TO DO**
1. In `walk-ui/src/search.rs`, create `GlobalSearch` struct: `{ query: String, matches: Vec<GlobalMatch>, current: usize, is_active: bool, search_input: String }` where `GlobalMatch { screen_row: i64 (negative = scrollback), col_start: u16, col_end: u16 }`.
2. Implement `GlobalSearch::search(&mut self, query: &str, screen: &Screen, scrollback: &ScrollbackBuffer)`: search all scrollback lines and all screen lines for case-insensitive substring matches.
3. Implement `next_match`, `prev_match`: cycle through matches, scroll the viewport to make the current match visible.
4. Implement `highlight_ranges_for_viewport(&self, viewport_start_row: i64, viewport_end_row: i64) -> Vec<(u16, u16, u16, bool)>`: returns `(row, col_start, col_end, is_current)` for matches visible in the current viewport.
5. UI: render a search bar overlay at the top of the viewport when active. Show match count "N of M".
6. Keybinding: `Cmd/Ctrl+F` (when no block selected) activates global search. `Enter` = next, `Shift+Enter` = prev, `Escape` = close.

**DONE WHEN**
- [ ] Searching "error" highlights all occurrences in both scrollback and visible screen.
- [ ] `next_match` scrolls the viewport to center the next match if it's off-screen.
- [ ] Match count displays "3 of 15" correctly.
- [ ] Closing search clears all highlights.

---

## Phase 13: Application Shell & Integration (+app)

### Task 49 (A) +app
**PURPOSE** — Main application struct: wires together all subsystems (platform, renderer, terminals, UI, config) into a running application.

**WHAT TO DO**
1. In `walk-core/src/app.rs`, create `WalkApp` struct:
   ```rust
   pub struct WalkApp {
       config: WalkConfig,
       theme: Theme,
       theme_watcher: ThemeWatcher,
       font_manager: FontManager,
       glyph_atlas: GlyphAtlas,
       tab_manager: TabManager,
       split_manager: SplitManager,
       input_editor: InputEditor,
       clipboard: ClipboardManager,
       selection: SelectionManager,
       global_search: GlobalSearch,
       zoom: ZoomManager,
       layout: LayoutNode,
       frame_clock: FrameClock,
       keybindings: KeybindingConfig,
   }
   ```
2. Implement `WalkApp::new(config: WalkConfig) -> Result<Self, AppError>`: initialize all subsystems in dependency order. Create default tab with detected shell.
3. Implement `AppHandler` for `WalkApp`:
   - `on_redraw()`: process PTY output for all terminals, poll theme watcher, compute layout, render all UI components.
   - `on_resize(size)`: recompute layout, resize terminals.
   - `on_key_event(event)`: resolve keybinding, dispatch action (or forward to input editor / PTY).
   - `on_mouse_event(event)`: dispatch to tab bar, split dividers, viewport selection, or input editor based on hit testing.
   - `on_focus_change(focused)`: pause/resume cursor blink.
   - `on_close_requested()`: if `confirm_close_with_running_process` and any terminal has running child processes, show confirmation (for now, just close).
4. Implement the action dispatch in `handle_action(&mut self, action: Action)` with match arms for every `Action` variant.

**DONE WHEN**
- [ ] `WalkApp::new(default_config)` creates a running app with one tab, one terminal, and a visible prompt.
- [ ] Typing produces visible characters in the terminal.
- [ ] All keybindings dispatch to their correct actions.
- [ ] Resizing recomputes layout and resizes PTY.

---

### Task 50 (A) +app
**PURPOSE** — Main entry point: the `fn main()` that ties everything together and starts the application.

**WHAT TO DO**
1. In `walk/src/main.rs` (the root crate):
   ```rust
   fn main() -> Result<(), Box<dyn Error>> {
       let config = WalkConfig::load();
       let window_config = WindowConfig { title: "Walk", width: 1200, height: 800 };
       let window = WalkWindow::new(&window_config)?;
       let surface = NativeSurface::from_window(&window)?;
       let renderer = create_renderer(&surface, window.size(), window.scale_factor())?;
       let mut app = WalkApp::new(config, renderer)?;
       run_event_loop(window, app);
   }
   ```
2. Handle CLI arguments: `--config <path>` to override config file, `--shell <shell>` to override default shell, `--title <title>` for window title, `--working-dir <path>` for initial CWD.
3. Use `clap = "4"` for argument parsing.
4. Set up panic handler: on panic, attempt to restore terminal state (raw mode cleanup) before printing the panic message.
5. Set up logging: use `tracing = "0.1"` with `tracing-subscriber` for structured logging. Default level: `warn` in release, `debug` in debug builds. Log to `~/.config/walk/walk.log`.

**DONE WHEN**
- [ ] `cargo run` launches Walk with a functional terminal.
- [ ] `cargo run -- --shell /bin/bash` opens with bash regardless of the user's default shell.
- [ ] `cargo run -- --working-dir /tmp` starts with CWD `/tmp`.
- [ ] A panic in any subsystem prints a useful backtrace and doesn't leave the terminal in a broken state.

---

## Phase 14: Cross-Platform Packaging (+build)

### Task 51 (B) +build
**PURPOSE** — macOS application bundle: packages Walk as a `.app` bundle with an icon, Info.plist, and code signing support.

**WHAT TO DO**
1. Create `packaging/macos/` directory.
2. Create `Info.plist` with: `CFBundleName: Walk`, `CFBundleIdentifier: dev.walk.terminal`, `CFBundleVersion: 0.1.0`, `CFBundleExecutable: walk`, `CFBundleIconFile: walk.icns`, `LSMinimumSystemVersion: 10.15`, `NSHighResolutionCapable: true`.
3. Create a build script `packaging/macos/bundle.sh` that: runs `cargo build --release`, creates `Walk.app/Contents/MacOS/walk`, copies binary, copies `Info.plist` to `Contents/`, copies `walk.icns` to `Contents/Resources/`.
4. Create a placeholder `walk.icns` (can be generated from a PNG using `iconutil`).
5. Add a Makefile target: `make bundle-macos`.

**DONE WHEN**
- [ ] `make bundle-macos` produces `Walk.app` that launches by double-clicking on macOS.
- [ ] The app icon appears in the Dock and in Finder.
- [ ] `Info.plist` values are correct when inspected with `plutil`.

---

### Task 52 (B) +build
**PURPOSE** — Linux packaging: produces `.deb` and `.AppImage` packages.

**WHAT TO DO**
1. Create `packaging/linux/` directory.
2. Create `walk.desktop` file: `[Desktop Entry]`, `Name=Walk`, `Exec=walk`, `Icon=walk`, `Type=Application`, `Categories=System;TerminalEmulator;`.
3. For `.deb`: create `packaging/linux/build_deb.sh` using `cargo-deb` or manual `dpkg-deb`. Include: binary at `/usr/bin/walk`, desktop file at `/usr/share/applications/walk.desktop`, icon at `/usr/share/icons/hicolor/256x256/apps/walk.png`, man page stub at `/usr/share/man/man1/walk.1.gz`.
4. For AppImage: create `packaging/linux/build_appimage.sh` using `linuxdeploy` with the AppDir structure: `AppDir/usr/bin/walk`, `AppDir/usr/share/applications/walk.desktop`, `AppDir/walk.png`.
5. Add Makefile targets: `make deb`, `make appimage`.

**DONE WHEN**
- [ ] `make deb` produces a `.deb` file that installs with `dpkg -i` and `walk` is available in PATH.
- [ ] `make appimage` produces a `.AppImage` that runs on a fresh Ubuntu system.
- [ ] `walk.desktop` causes Walk to appear in the application launcher.

---

### Task 53 (B) +build
**PURPOSE** — Windows packaging: produces an installer and ensures WSL integration works.

**WHAT TO DO**
1. Create `packaging/windows/` directory.
2. Create a WiX-based or Inno Setup installer script (`walk_installer.iss` or `walk.wxs`) that: installs `walk.exe` to `%PROGRAMFILES%\Walk\`, adds to PATH, creates Start Menu shortcut, registers as a terminal emulator.
3. Create `build_windows.ps1` script: runs `cargo build --release --target x86_64-pc-windows-msvc`, then invokes the installer compiler.
4. For `winget` manifest: create `packaging/windows/winget/Walk.Walk.yaml` with installer metadata.
5. Add Makefile target: `make installer-windows` (runs via PowerShell or cross-compilation).

**DONE WHEN**
- [ ] The installer installs Walk and it's accessible from the Start Menu.
- [ ] `walk.exe` is in PATH after installation.
- [ ] Uninstaller cleanly removes all files.

---

### Task 54 (B) +build
**PURPOSE** — CI/CD pipeline: automated building, testing, and packaging on all three platforms.

**WHAT TO DO**
1. Create `.github/workflows/ci.yml`:
   - Matrix: `[macos-latest, ubuntu-latest, windows-latest]`.
   - Steps: checkout, install Rust stable, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, `cargo build --release`.
   - On tag push (`v*`): run packaging scripts for each platform, upload artifacts.
2. Create `.github/workflows/release.yml`: on tag push, build all platform packages and create a GitHub Release with attached binaries.
3. Add `cargo fmt --check` to CI.
4. Add basic integration test in `tests/integration/`: spawn Walk in headless mode (no window), send input to PTY, verify output.

**DONE WHEN**
- [ ] Push to `main` triggers CI on all 3 platforms; all checks pass.
- [ ] Pushing a `v0.1.0` tag creates a GitHub Release with macOS `.app`, Linux `.deb` + `.AppImage`, and Windows installer attached.
- [ ] `cargo clippy` and `cargo fmt --check` pass with zero warnings/errors.

---

## Phase 15: Polish & Edge Cases (+polish)

### Task 55 (B) +polish
**PURPOSE** — Terminal bell handling: responds to BEL character (0x07) with visual or audible feedback.

**WHAT TO DO**
1. In `walk-core/src/bell.rs`, implement `BellHandler` with config option: `BellStyle { Visual, Audible, None }`.
2. Visual bell: briefly flash the terminal background (invert for 100ms, then revert).
3. Audible bell: use platform audio API to play the system alert sound. On macOS: `NSBeep()`. On Linux: use `XBell()` or write `\x07` to system speaker. On Windows: `MessageBeep(MB_OK)`.
4. Wire into the VT action handler: when `Execute(0x07)` fires, trigger the bell.

**DONE WHEN**
- [ ] `echo -e "\a"` in the terminal triggers a visual flash (with `bell_style = Visual`).
- [ ] Bell respects the config setting: `None` produces no effect.

---

### Task 56 (B) +polish
**PURPOSE** — URL detection and clickable links: detect URLs in terminal output and make them clickable to open in the default browser.

**WHAT TO DO**
1. In `walk-ui/src/links.rs`, implement `fn detect_urls(line: &[Cell]) -> Vec<UrlSpan>` where `UrlSpan { col_start: u16, col_end: u16, url: String }`.
2. Use a regex pattern matching `https?://[^\s<>"{}|\\^[\]` + `` ` ``  to find URLs in the text content of cells.
3. Render detected URLs with underline decoration and a distinct color (from theme).
4. On `Cmd/Ctrl+Click` on a URL: open in default browser using `open` (macOS), `xdg-open` (Linux), or `start` (Windows) via `std::process::Command`.
5. On hover over a URL, change cursor to pointer (if windowing system supports it) and show a tooltip with the full URL.

**DONE WHEN**
- [ ] `echo "visit https://example.com today"` renders the URL underlined in a distinct color.
- [ ] Cmd+Click on the URL opens `https://example.com` in the default browser.
- [ ] URLs with paths, query strings, and fragments are correctly detected: `https://example.com/path?q=1#section`.
- [ ] Non-URLs like `http://` alone or broken URLs are not detected.

---

### Task 57 (C) +polish
**PURPOSE** — Window title tracking: updates the native window title based on OSC 0/2 sequences from the shell (showing the running command or CWD).

**WHAT TO DO**
1. In the VT parser's OSC handler, detect OSC 0 (`\033]0;title\007`) and OSC 2 (`\033]2;title\007`).
2. When received, emit a `SemanticEvent::TitleChanged(String)`.
3. In the app handler, update `WalkWindow::set_title(title)` (via `winit::window::Window::set_title`).
4. Also update the corresponding tab title in `TabManager`.

**DONE WHEN**
- [ ] Running `printf '\033]0;My Custom Title\007'` changes the window title to "My Custom Title".
- [ ] The tab title also updates.
- [ ] Starting `vim` updates the title to reflect vim's title-setting sequence.

---

### Task 58 (C) +polish
**PURPOSE** — Mouse reporting: forwards mouse events to the PTY when the shell/application requests mouse tracking (for vim, tmux, etc.).

**WHAT TO DO**
1. In the VT action handler, detect mode setting sequences for mouse tracking:
   - `\033[?1000h` (X11 mouse tracking), `\033[?1002h` (button event tracking), `\033[?1003h` (any event tracking), `\033[?1006h` (SGR extended mode).
2. Track which mouse modes are active in a `MouseMode` bitflags on `Screen`.
3. When mouse events occur in the viewport and mouse reporting is enabled:
   - Encode mouse button + position in the requested format (X10, normal, SGR extended).
   - Send the encoded bytes to PTY via `terminal.send_input()`.
   - SGR format: `\033[<button;col;rowM` (press) or `\033[<button;col;rowm` (release).
4. When mouse reporting is active, disable Walk's own selection (the application handles its own mouse input).

**DONE WHEN**
- [ ] Opening `vim` in Walk and clicking positions the vim cursor at the clicked cell.
- [ ] `tmux` mouse support works: clicking panes switches focus, scrolling works.
- [ ] When mouse reporting is disabled (exiting vim), Walk's selection behavior resumes.

---

### Task 59 (C) +polish
**PURPOSE** — Sixel / image protocol support (basic): renders inline images in the terminal for tools that output them.

**WHAT TO DO**
1. In the VT parser, detect Sixel data sequences (DCS `q` for sixel graphics) and the iTerm2/Kitty image protocols (OSC 1337 for iTerm2, APC for Kitty).
2. For basic Sixel support: parse the Sixel data into an RGBA pixel buffer. Create a GPU texture from it. Render the texture inline at the cursor position, spanning the appropriate number of cell rows/columns.
3. Store inline images in a `Vec<InlineImage>` on the Screen: `InlineImage { texture_id: TextureId, row: u16, col: u16, width_cells: u16, height_cells: u16 }`.
4. Render inline images in the viewport renderer after drawing text.
5. Start with Sixel only; iTerm2/Kitty protocols can be added later.

**DONE WHEN**
- [ ] A tool that outputs Sixel graphics (e.g., `img2sixel image.png` from `libsixel`) displays the image inline in the terminal.
- [ ] The image occupies the correct number of cell rows and columns.
- [ ] Scrolling past the image works correctly (image scrolls with text).

---

### Task 60 (C) +polish
**PURPOSE** — Session persistence: save and restore terminal sessions (scrollback content, working directory, tab layout) across app restarts.

**WHAT TO DO**
1. In `walk-config/src/session.rs`, define `SessionState`:
   ```rust
   pub struct SessionState {
       pub tabs: Vec<TabState>,
       pub split_tree: SplitNodeState,
       pub active_tab: usize,
       pub window_size: (u32, u32),
       pub window_position: (i32, i32),
   }
   pub struct TabState {
       pub cwd: PathBuf,
       pub shell: ShellType,
       pub scrollback_text: String,
       pub title: String,
   }
   ```
2. Implement `fn save_session(app: &WalkApp) -> Result<(), SessionError>`: serialize `SessionState` to JSON, write to `~/.config/walk/session.json`.
3. Implement `fn load_session(path: &Path) -> Result<SessionState, SessionError>`.
4. On app close: save session. On app start: if session file exists, offer to restore (or auto-restore based on config `restore_session: bool`).
5. Restoring: create tabs with saved shell and CWD, populate scrollback (as plain text — no styles preserved), restore split layout.

**DONE WHEN**
- [ ] Closing Walk with 3 tabs and reopening restores 3 tabs with the correct CWDs.
- [ ] Split pane layout is restored.
- [ ] Scrollback text from the previous session is visible (even without original styling).
- [ ] `restore_session = false` in config prevents auto-restore.
