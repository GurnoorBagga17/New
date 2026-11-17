fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var_os("PROTOC").is_none() {
        if let Ok(protoc) = protoc_bin_vendored::protoc_bin_path() {
            std::env::set_var("PROTOC", protoc);
        } else {
            let winget_protoc = std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default())
                .join("Microsoft/WinGet/Packages/Google.Protobuf_Microsoft.Winget.Source_8wekyb3d8bbwe/bin/protoc.exe");
            if winget_protoc.exists() {
                std::env::set_var("PROTOC", &winget_protoc);
            }
        }
    }
    let root = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR")?).join("../../..");
    let proto = root.join("proto/ext_mcp.proto");
    let include = root.join("proto");
    let google_include = protoc_bin_vendored::include_path().unwrap_or_else(|_| root.join("proto"));
    let compile_result = tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .compile_protos(std::slice::from_ref(&proto), &[include, google_include]);
    if let Err(err) = compile_result {
        let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR")?);
        let fallback = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR")?).join("src/generated_proto.rs");
        if fallback.exists() {
            std::fs::copy(&fallback, out_dir.join("agentgateway.dev.ext_mcp.rs"))?;
            eprintln!("cargo:warning=protoc invocation failed ({}); used cached generated_proto.rs", err);
        } else {
            return Err(err.into());
        }
    }
    println!(
        "cargo:rerun-if-changed={}",
        root.join("proto/ext_mcp.proto").display()
    );
    Ok(())
}
