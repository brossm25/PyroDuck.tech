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
    hash = "sha256-RO4lZcmgAQjjahE0hHvffOGhTsPjh5Ki/V3bAPwY4iQ=";
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
