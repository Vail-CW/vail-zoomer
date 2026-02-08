fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("mic_permission.m")
            .flag("-fobjc-arc")
            .compile("mic_permission");

        println!("cargo:rustc-link-lib=framework=AVFoundation");
    }
}
