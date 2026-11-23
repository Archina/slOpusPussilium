{ pkgs, ... }:
{
  languages.javascript = {
    enable = true;
    npm.enable = true;
  };

  packages = [
    pkgs.nodejs_24
    pkgs.chromium
  ];

  env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";

  enterShell = ''
    echo "Opus Pusillium — run: npm install && npm run dev"
  '';
}
