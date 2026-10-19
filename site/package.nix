{
  pkgs,
  stdenv,
  version,
  ...
}:
stdenv.mkDerivation rec {
  inherit version;

  pname = "site";
  src = ./.;

  nativeBuildInputs = [
    pkgs.nodejs
    pkgs.pnpm
    pkgs.pnpmConfigHook
  ];

  pnpmDeps = pkgs.fetchPnpmDeps {
    inherit pname version src;
    fetcherVersion = 4;
    hash = "sha256-HXknEJkVwmy92mU2wjO8vv0C11Qdhe3yxLC6zZj91xg=";
  };

  postUnpack = ''

  '';

  buildPhase = ''
    pnpm build
  '';

  installPhase = ''
    mkdir -p $out/share/site
    cp -R ./dist/* $out/share/site
  '';
}
