{
  description = "pyroduck.tech";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-26.05";
  };

  outputs =
    {
      ...
    }@inputs:
    let
      system = "x86_64-linux";

      pkgs = import inputs.nixpkgs {
        inherit system;
      };

      site = pkgs.callPackage ./site/package.nix {
        inherit inputs;
        version = "0.1.0";
      };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          nixd
          nixfmt
          nodejs_24
          pnpm_11
          starship
        ];

        shellHook = ''
          eval "$(starship init bash)"
        '';
      };

      packages.${system}.default = site;
    };
}
