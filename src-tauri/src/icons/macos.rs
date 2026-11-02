//! macOS: ask the system for the app's icon (the same one Finder and the Dock show),
//! whichever way the bundle stores it (.icns, asset catalog, or a system app).

use std::path::{Path, PathBuf};

use objc2::{rc::Retained, AllocAnyThread};
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};

use super::{Icon, ICON_PX};

/// The `.app` bundle an executable belongs to (the outermost one, so helpers map
/// to their parent app), or the executable itself when it isn't in a bundle.
fn bundle_of(process_path: &Path) -> PathBuf {
    let mut bundle = PathBuf::new();
    for comp in process_path.components() {
        bundle.push(comp);
        if comp.as_os_str().to_string_lossy().ends_with(".app") {
            return bundle;
        }
    }
    process_path.to_path_buf()
}

/// Must run on the main thread (AppKit).
pub fn extract(process_path: &Path) -> Option<Icon> {
    let target = bundle_of(process_path);
    let target = target.to_str()?;
    let image = NSWorkspace::sharedWorkspace().iconForFile(&NSString::from_str(target));
    let side = ICON_PX as f64;
    let mut rect = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(side, side));
    // SAFETY: `rect` is a valid, exclusive pointer for the duration of the call.
    let cg = unsafe { image.CGImageForProposedRect_context_hints(&mut rect, None, None) }?;
    let rep: Retained<NSBitmapImageRep> = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg);
    // SAFETY: an empty properties dictionary is valid for every file type.
    let png = unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()) }?;
    let data = png.to_vec();
    (!data.is_empty()).then_some(Icon { mime: "image/png", data })
}

#[cfg(test)]
mod tests {
    use super::bundle_of;
    use std::path::Path;

    #[test]
    fn helpers_map_to_their_outermost_app() {
        let helper = Path::new("/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper");
        assert_eq!(bundle_of(helper), Path::new("/Applications/Google Chrome.app"));
        assert_eq!(bundle_of(Path::new("/usr/local/bin/nvim")), Path::new("/usr/local/bin/nvim"));
    }
}
