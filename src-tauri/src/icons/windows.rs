//! Windows: the large icon stored in the app's executable, converted to PNG.

use std::{os::windows::ffi::OsStrExt, path::Path};

use windows::{
    core::PCWSTR,
    Win32::{
        Graphics::Gdi::{
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
        },
        UI::{
            Shell::SHDefExtractIconW,
            WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO},
        },
    },
};

use super::{Icon, ICON_PX};

pub fn extract(process_path: &Path) -> Option<Icon> {
    let wide: Vec<u16> = process_path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut icon = HICON::default();
    // Low word: the large icon's size in pixels; high word: the small one's (unused).
    let sizes = ICON_PX | (16 << 16);
    // SAFETY: `wide` is NUL-terminated and outlives the call; `icon` is a valid out-pointer.
    let hr = unsafe { SHDefExtractIconW(PCWSTR(wide.as_ptr()), 0, 0, Some(&mut icon), None, sizes) };
    if hr.is_err() || icon.is_invalid() {
        return None;
    }
    // SAFETY: `icon` is a live icon handle we own until DestroyIcon below.
    let pixels = unsafe { icon_rgba(icon) };
    let _ = unsafe { DestroyIcon(icon) };
    let (w, h, rgba) = pixels?;
    encode_png(w, h, &rgba).map(|data| Icon { mime: "image/png", data })
}

/// An icon's pixels as straight RGBA, top row first.
///
/// # Safety
/// `icon` must be a valid icon handle.
unsafe fn icon_rgba(icon: HICON) -> Option<(u32, u32, Vec<u8>)> {
    let mut info = ICONINFO::default();
    unsafe { GetIconInfo(icon, &mut info) }.ok()?;
    let pixels = if info.hbmColor.is_invalid() {
        None // monochrome icons: too old to be worth drawing
    } else {
        unsafe { read_color(info.hbmColor, info.hbmMask) }
    };
    unsafe {
        let _ = DeleteObject(info.hbmColor.into());
        let _ = DeleteObject(info.hbmMask.into());
    }
    pixels
}

/// # Safety
/// Both handles must be valid bitmaps belonging to the same icon.
unsafe fn read_color(color: HBITMAP, mask: HBITMAP) -> Option<(u32, u32, Vec<u8>)> {
    let mut bm = BITMAP::default();
    let got = unsafe {
        GetObjectW(color.into(), std::mem::size_of::<BITMAP>() as i32, Some((&mut bm as *mut BITMAP).cast()))
    };
    if got == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
        return None;
    }
    let (w, h) = (bm.bmWidth as u32, bm.bmHeight as u32);
    // Top-down 32-bit BGRA, whatever the bitmap's own format.
    let header = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: w as i32,
        biHeight: -(h as i32),
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let dc = unsafe { CreateCompatibleDC(None) };
    let read = |bitmap: HBITMAP| -> Option<Vec<u8>> {
        let mut buf = vec![0u8; (w * h * 4) as usize];
        let mut bmi = BITMAPINFO { bmiHeader: header, ..Default::default() };
        let lines = unsafe { GetDIBits(dc, bitmap, 0, h, Some(buf.as_mut_ptr().cast()), &mut bmi, DIB_RGB_COLORS) };
        (lines > 0).then_some(buf)
    };
    let mut bgra = read(color);
    // Icons without an alpha channel keep their transparency in the 1-bit mask
    // (black = opaque).
    if let Some(px) = bgra.as_mut() {
        if px.chunks_exact(4).all(|p| p[3] == 0) {
            match read(mask) {
                Some(m) => px.chunks_exact_mut(4).zip(m.chunks_exact(4)).for_each(|(p, m)| p[3] = if m[0] == 0 { 255 } else { 0 }),
                None => px.chunks_exact_mut(4).for_each(|p| p[3] = 255),
            }
        }
    }
    let _ = unsafe { DeleteDC(dc) };
    let mut rgba = bgra?;
    rgba.chunks_exact_mut(4).for_each(|p| p.swap(0, 2));
    Some((w, h, rgba))
}

fn encode_png(w: u32, h: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, w, h);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(out)
}
