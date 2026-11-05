// What Patchy watches. The defaults come from the stacks in ~/Projects and ~/Next:
// the WordPress plugins used on the most sites, the PHP versions in the DDEV
// configs, Laravel (maco-core), Next.js and Payload, and Ubuntu LTS servers.

export type Group = "wordpress" | "php" | "javascript" | "server";

export interface Stack {
  /** WordPress core branches, such as "7.1". "latest" follows the newest release. */
  wpCore: string[];
  wpPlugins: string[];
  wpThemes: string[];
  /** PHP branches, such as "8.3". */
  php: string[];
  /** Composer packages, such as "laravel/framework". */
  composer: string[];
  npm: string[];
  /** Node.js major versions, such as "24". */
  node: string[];
  /** Ubuntu release codenames, such as "noble". */
  ubuntu: string[];
  /** Ubuntu source package names. A name also matches longer names that start with it plus "-" or a digit, so "linux" matches "linux-aws" and "php" matches "php8.3". */
  ubuntuPackages: string[];
  nginx: string[];
  mysql: string[];
  mariadb: string[];
}

export const DEFAULT_STACK: Stack = {
  wpCore: ["latest"],
  wpPlugins: [
    "woocommerce",
    "duracelltomi-google-tag-manager",
    "disable-emails",
    "safe-svg",
    "cookie-information-consent-solution",
    "simple-history",
    "wordpress-seo",
    "redirection",
    "seo-by-rank-math",
    "contact-form-7",
    "woo-vipps",
    "login-with-vipps",
    "ultimate-addons-for-gutenberg",
    "simple-cloudflare-turnstile",
    "klarna-checkout-for-woocommerce",
    "klarna-payments-for-woocommerce",
    "klarna-order-management-for-woocommerce",
    "woocommerce-pdf-invoices-packing-slips",
    "woocommerce-gateway-stripe",
    "dintero-checkout-for-woocommerce",
    "mailchimp-for-woocommerce",
    "mailchimp-for-wp",
    "klaviyo",
    "wp-mail-smtp",
    "cookie-notice",
    "duplicate-post",
    "autoptimize",
    "loco-translate",
    "enable-media-replace",
    "query-monitor",
    "mainwp-child",
    "generateblocks",
    "posten-bring-checkout",
    "metorik-helper",
  ],
  wpThemes: ["astra", "generatepress"],
  php: ["8.5", "8.4", "8.3", "8.0", "7.4"],
  composer: ["laravel/framework", "filament/filament", "livewire/livewire", "guzzlehttp/guzzle", "symfony/http-foundation", "league/flysystem", "phpmailer/phpmailer"],
  npm: ["next", "react-dom", "payload", "@payloadcms/next", "vite", "axios", "express", "sharp", "jsonwebtoken"],
  node: ["24", "22"],
  ubuntu: ["noble", "jammy"],
  ubuntuPackages: [
    "linux",
    "openssl",
    "openssh",
    "nginx",
    "php",
    "mysql",
    "mariadb",
    "curl",
    "sudo",
    "glibc",
    "systemd",
    "git",
    "imagemagick",
    "redis",
    "libxml2",
    "python3",
    "nodejs",
    "docker.io",
    "containerd",
    "rsync",
    "libssh",
    "gnutls28",
    "expat",
    "zlib",
    "libgd2",
    "ghostscript",
    "postfix",
    "exim4",
    "bind9",
    "pcre2",
  ],
  nginx: ["1.24", "1.28"],
  mysql: ["8.0", "8.4"],
  mariadb: ["10.11", "11.4"],
};

const STACK_KEY = "patchy.stack";

export function loadStack(): Stack {
  try {
    const saved = JSON.parse(localStorage.getItem(STACK_KEY) ?? "null") as Partial<Stack> | null;
    return { ...DEFAULT_STACK, ...(saved ?? {}) };
  } catch {
    return DEFAULT_STACK;
  }
}

export function saveStack(stack: Stack) {
  localStorage.setItem(STACK_KEY, JSON.stringify(stack));
}

/** A product in the side panel: one plugin, one package, one PHP branch and so on. */
export interface Product {
  id: string;
  label: string;
  group: Group;
}

export const GROUP_LABELS: Record<Group, string> = {
  wordpress: "WordPress",
  php: "PHP",
  javascript: "JavaScript",
  server: "Servers",
};
