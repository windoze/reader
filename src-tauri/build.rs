fn main() {
    #[cfg(target_os = "macos")]
    tauri_plugin::mobile::update_info_plist(|plist| {
        // iOS needs this string before it can prompt for LAN access to the dev server.
        plist.insert(
            "NSLocalNetworkUsageDescription".into(),
            "Reader needs local network access to connect to the development server.".into(),
        );
    })
    .expect("failed to update iOS Info.plist");

    tauri_build::build();
}
