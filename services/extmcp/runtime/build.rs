fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    std::env::set_var("PROTOC", protoc);
    let root = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR")?).join("../../..");
    let proto = root.join("proto/ext_mcp.proto");
    let include = root.join("proto");
    let google_include = protoc_bin_vendored::include_path()?;
    tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .compile_protos(&[proto], &[include, google_include])?;
    println!(
        "cargo:rerun-if-changed={}",
        root.join("proto/ext_mcp.proto").display()
    );
    Ok(())
}
