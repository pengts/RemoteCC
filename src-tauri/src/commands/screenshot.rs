//! Screenshot functionality — removed for web mode.
//! Web browsers handle screenshots natively; no global hotkey support.

pub async fn capture_screenshot() -> Result<(), String> {
    Err("Screenshot capture is not available in web mode".to_string())
}

pub fn update_screenshot_hotkey(_hotkey: Option<String>) -> Result<(), String> {
    Err("Screenshot hotkeys are not available in web mode".to_string())
}
