/**
 * Security Scanner for HPC Job Submissions
 * 
 * Scans uploaded ZIP files for malicious code patterns before forwarding to Slurm master.
 * Covers: Python (.py), Bash (.sh/.bash), and config (.yaml/.yml/.json/.cfg) files.
 * 
 * Design goals:
 *   - Block genuine threats (reverse shells, mining, brute-force tools, system destruction)
 *   - Allow legitimate HPC/ML code (pip install, torch, nvidia-smi, wget datasets, etc.)
 */

const AdmZip = require("adm-zip");
const path = require("path");

// ─── Severity Levels ─────────────────────────────────────────────────────────
const SEVERITY = {
  CRITICAL: "critical",
  HIGH: "high",
};

// ─── File types to scan ──────────────────────────────────────────────────────
const SCANNABLE_EXTENSIONS = new Set([
  ".py", ".sh", ".bash", ".yaml", ".yml", ".json", ".cfg", ".conf", ".ini", ".toml",
]);

// ─── Security Rules ──────────────────────────────────────────────────────────
// Each rule: { id, name, description, severity, pattern, fileTypes, category }
// pattern: RegExp with 'i' flag where appropriate
// fileTypes: array of extensions this rule applies to, or null for all scannable types

const RULES = [

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Reverse Shells
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "RS001",
    name: "Bash Reverse Shell (TCP)",
    description: "Bash reverse shell using /dev/tcp",
    severity: SEVERITY.CRITICAL,
    pattern: /\/dev\/tcp\/[^\s]+\/\d+/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "reverse_shell",
  },
  {
    id: "RS002",
    name: "Bash Interactive Reverse Shell",
    description: "Bash interactive shell redirected to network",
    severity: SEVERITY.CRITICAL,
    pattern: /bash\s+-i\s+>&?\s*\/dev\/tcp/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "reverse_shell",
  },
  {
    id: "RS003",
    name: "Netcat Reverse Shell",
    description: "Netcat used to spawn a shell",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(nc|ncat|netcat)\b.*\s-e\s*(\/bin\/(ba)?sh|\/bin\/zsh|cmd)/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "reverse_shell",
  },
  {
    id: "RS004",
    name: "Python Reverse Shell",
    description: "Python socket-based reverse shell pattern",
    severity: SEVERITY.CRITICAL,
    pattern: /socket\.socket\(.*\)[\s\S]{0,500}(connect\(|\.connect\()[\s\S]{0,500}(dup2|subprocess|os\.system)/i,
    fileTypes: [".py"],
    category: "reverse_shell",
  },
  {
    id: "RS005",
    name: "Perl/Ruby Reverse Shell",
    description: "Perl or Ruby reverse shell one-liner",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(perl|ruby)\b.*-e\s*['"](.*socket.*exec|.*TCPSocket)/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "reverse_shell",
  },
  {
    id: "RS006",
    name: "Socat Reverse Shell",
    description: "Socat-based reverse shell",
    severity: SEVERITY.CRITICAL,
    pattern: /\bsocat\b.*\bexec\b.*\bsh\b/i,
    fileTypes: [".sh", ".bash"],
    category: "reverse_shell",
  },
  {
    id: "RS007",
    name: "Telnet Reverse Shell",
    description: "Telnet pipe-based reverse shell",
    severity: SEVERITY.CRITICAL,
    pattern: /\btelnet\b.*\|\s*\/bin\/(ba)?sh/i,
    fileTypes: [".sh", ".bash"],
    category: "reverse_shell",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Fork Bombs / Resource Exhaustion
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "FB001",
    name: "Bash Fork Bomb",
    description: "Classic bash fork bomb pattern",
    severity: SEVERITY.CRITICAL,
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,
    fileTypes: [".sh", ".bash"],
    category: "fork_bomb",
  },
  {
    id: "FB002",
    name: "Fork Bomb Variant",
    description: "Fork bomb using function recursion",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(\w+)\(\)\s*\{\s*\1\s*\|\s*\1\s*&\s*\}/,
    fileTypes: [".sh", ".bash"],
    category: "fork_bomb",
  },
  {
    id: "FB003",
    name: "Python Fork Bomb",
    description: "Infinite os.fork() loop",
    severity: SEVERITY.CRITICAL,
    pattern: /while\s+(True|1)\s*:[\s\S]{0,100}os\.fork\(\)/i,
    fileTypes: [".py"],
    category: "fork_bomb",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: System Destruction
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "SD001",
    name: "Recursive Root Delete",
    description: "rm -rf targeting root filesystem",
    severity: SEVERITY.CRITICAL,
    // Matches rm -rf / or rm -rf /* but NOT rm -rf ./something or rm -rf $VAR
    pattern: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+(-[a-zA-Z]+\s+)*|(-[a-zA-Z]+\s+)*-[a-zA-Z]*f[a-zA-Z]*\s+)\/?(\*|\s|$|;)/,
    fileTypes: [".sh", ".bash"],
    category: "system_destruction",
  },
  {
    id: "SD002",
    name: "Disk Format Command",
    description: "Disk formatting utility usage",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(mkfs\.\w+|mkfs\s|wipefs\s|fdisk\s+\/dev\/)/i,
    fileTypes: [".sh", ".bash"],
    category: "system_destruction",
  },
  {
    id: "SD003",
    name: "Disk Overwrite (dd)",
    description: "dd writing directly to disk device",
    severity: SEVERITY.CRITICAL,
    pattern: /\bdd\b.*\bof\s*=\s*\/dev\/(sd[a-z]|nvme|vd[a-z]|hd[a-z]|disk)/i,
    fileTypes: [".sh", ".bash"],
    category: "system_destruction",
  },
  {
    id: "SD004",
    name: "Critical System Files Overwrite",
    description: "Overwriting critical boot/system files",
    severity: SEVERITY.CRITICAL,
    pattern: />\s*\/boot\/|>\s*\/dev\/sda|>\s*\/etc\/(fstab|sudoers|hosts)\b/i,
    fileTypes: [".sh", ".bash"],
    category: "system_destruction",
  },
  {
    id: "SD005",
    name: "Python System Destruction",
    description: "Python code removing root filesystem",
    severity: SEVERITY.CRITICAL,
    pattern: /shutil\.rmtree\s*\(\s*['"]\/['"]\s*\)|os\.remove\s*\(\s*['"]\/['"]\s*\)/i,
    fileTypes: [".py"],
    category: "system_destruction",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Privilege Escalation
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "PE001",
    name: "Sudo Usage",
    description: "Attempting to use sudo to escalate privileges",
    severity: SEVERITY.HIGH,
    // Won't match 'sudo' inside comments (lines starting with #) - handled in scanner logic
    pattern: /\bsudo\s+\S/i,
    fileTypes: [".sh", ".bash"],
    category: "privilege_escalation",
  },
  {
    id: "PE002",
    name: "SetUID Bit Manipulation",
    description: "Setting SUID/SGID bits on executables",
    severity: SEVERITY.CRITICAL,
    pattern: /\bchmod\s+[ugo]*\+?[0-7]*s[0-7]*\s|chmod\s+(4|2|6)[0-7]{3}\s/i,
    fileTypes: [".sh", ".bash"],
    category: "privilege_escalation",
  },
  {
    id: "PE003",
    name: "Chown to Root",
    description: "Changing file ownership to root",
    severity: SEVERITY.HIGH,
    pattern: /\bchown\s+(root|0)\s*[:\.]/i,
    fileTypes: [".sh", ".bash"],
    category: "privilege_escalation",
  },
  {
    id: "PE004",
    name: "Shadow File Access",
    description: "Attempting to read or write shadow password file",
    severity: SEVERITY.CRITICAL,
    pattern: /\/etc\/shadow/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "privilege_escalation",
  },
  {
    id: "PE005",
    name: "Su Root",
    description: "Switching to root user",
    severity: SEVERITY.HIGH,
    pattern: /\bsu\s+(-\s+)?root\b/i,
    fileTypes: [".sh", ".bash"],
    category: "privilege_escalation",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Crypto Mining
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "CM001",
    name: "Known Crypto Miner Binary",
    description: "Reference to known cryptocurrency mining software",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(xmrig|xmr-stak|minerd|cpuminer|cgminer|bfgminer|ethminer|gminer|t-rex|phoenixminer|lolminer|nbminer|claymore|nicehash|minergate|coinhive)\b/i,
    fileTypes: null, // scan all file types
    category: "crypto_mining",
  },
  {
    id: "CM002",
    name: "Mining Pool Connection",
    description: "Connection string to a mining pool",
    severity: SEVERITY.CRITICAL,
    pattern: /stratum\+tcp:\/\/|stratum\+ssl:\/\/|mining\.pool|pool\.\w+\.\w+:\d{4,5}/i,
    fileTypes: null,
    category: "crypto_mining",
  },
  {
    id: "CM003",
    name: "Monero Wallet Address",
    description: "Monero cryptocurrency wallet address pattern",
    severity: SEVERITY.CRITICAL,
    pattern: /\b4[0-9AB][0-9a-zA-Z]{93}\b/,
    fileTypes: null,
    category: "crypto_mining",
  },
  {
    id: "CM004",
    name: "Mining Keywords in Config",
    description: "Mining-related configuration keywords",
    severity: SEVERITY.HIGH,
    pattern: /["'](algo|coin|pool|wallet|miner)["']\s*[:=]\s*["']?(cryptonight|randomx|ethash|kawpow|autolykos)/i,
    fileTypes: [".json", ".yaml", ".yml", ".cfg", ".conf", ".ini", ".toml"],
    category: "crypto_mining",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Brute Force / Password Cracking Tools
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "BF001",
    name: "Brute Force Tool",
    description: "Usage of brute force / password cracking tool",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(hydra|hashcat|john|medusa|ncrack|patator|thc-hydra|aircrack-ng|wfuzz|gobuster|dirb|dirbuster|sqlmap)\b/i,
    fileTypes: null,
    category: "brute_force",
  },
  {
    id: "BF002",
    name: "Wordlist / Password List Reference",
    description: "Reference to common password wordlists",
    severity: SEVERITY.HIGH,
    pattern: /\b(rockyou\.txt|wordlist\.txt|passwords\.txt|darkweb.*\.txt|common-passwords|SecLists)\b/i,
    fileTypes: null,
    category: "brute_force",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Network Reconnaissance
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "NR001",
    name: "Network Scanner Tool",
    description: "Usage of network scanning/enumeration tool",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(nmap|masscan|zmap|arp-scan|enum4linux|nikto|fierce|amass|subfinder)\b\s/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "network_recon",
  },
  {
    id: "NR002",
    name: "Port Scanning in Python",
    description: "Python code for port scanning",
    severity: SEVERITY.HIGH,
    pattern: /socket\.socket\([\s\S]{0,200}(connect_ex|for\s+port|range\s*\(\s*\d+\s*,\s*\d{3,5}\s*\))/i,
    fileTypes: [".py"],
    category: "network_recon",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Encoded / Obfuscated Payloads
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "EP001",
    name: "Base64 Decoded to Shell",
    description: "Base64 payload piped to shell for execution",
    severity: SEVERITY.CRITICAL,
    pattern: /base64\s+(-d|--decode)\s*.*\|\s*(ba)?sh/i,
    fileTypes: [".sh", ".bash"],
    category: "encoded_payload",
  },
  {
    id: "EP002",
    name: "Python Exec with Base64",
    description: "Python exec/eval with base64 decoded payload",
    severity: SEVERITY.CRITICAL,
    pattern: /(exec|eval)\s*\(\s*(base64\.b64decode|codecs\.decode|bytes\.fromhex)\s*\(/i,
    fileTypes: [".py"],
    category: "encoded_payload",
  },
  {
    id: "EP003",
    name: "Python Exec with Compile",
    description: "exec(compile(...)) used for obfuscation",
    severity: SEVERITY.HIGH,
    pattern: /exec\s*\(\s*compile\s*\(/i,
    fileTypes: [".py"],
    category: "encoded_payload",
  },
  {
    id: "EP004",
    name: "Hex Encoded Shellcode",
    description: "Hex-encoded shellcode pattern",
    severity: SEVERITY.CRITICAL,
    pattern: /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){15,}/i,
    fileTypes: [".py", ".sh", ".bash"],
    category: "encoded_payload",
  },
  {
    id: "EP005",
    name: "Python Marshal/Pickle Code Execution",
    description: "marshal.loads or pickle used for code execution",
    severity: SEVERITY.HIGH,
    pattern: /(marshal\.loads|pickle\.loads)\s*\(\s*(base64|codecs|bytes)/i,
    fileTypes: [".py"],
    category: "encoded_payload",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Dangerous Downloads (Download & Execute)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "DD001",
    name: "Curl Pipe to Shell",
    description: "Downloading and executing remote script via curl",
    severity: SEVERITY.CRITICAL,
    pattern: /\bcurl\b.*\|\s*(ba)?sh\b/i,
    fileTypes: [".sh", ".bash"],
    category: "dangerous_download",
  },
  {
    id: "DD002",
    name: "Wget Pipe to Shell",
    description: "Downloading and executing remote script via wget",
    severity: SEVERITY.CRITICAL,
    pattern: /\bwget\b.*\|\s*(ba)?sh\b/i,
    fileTypes: [".sh", ".bash"],
    category: "dangerous_download",
  },
  {
    id: "DD003",
    name: "Curl/Wget to Shell (Two-Step)",
    description: "Download then execute pattern",
    severity: SEVERITY.HIGH,
    pattern: /\b(curl|wget)\b.*-[oO]\s+\/tmp\/\S+[\s\S]{0,100}(chmod\s+\+x|bash|sh|\.\/)\s*\/tmp\//i,
    fileTypes: [".sh", ".bash"],
    category: "dangerous_download",
  },
  {
    id: "DD004",
    name: "Python URL to Exec",
    description: "Python downloading and executing remote code",
    severity: SEVERITY.CRITICAL,
    pattern: /(urllib|requests)\.\w+\([\s\S]{0,200}(exec|eval|os\.system|subprocess)\s*\(/i,
    fileTypes: [".py"],
    category: "dangerous_download",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Data Exfiltration
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "DE001",
    name: "SSH Key Theft",
    description: "Accessing or exfiltrating SSH keys or authorized_keys",
    severity: SEVERITY.CRITICAL,
    pattern: /\/(\.ssh\/(id_rsa|id_ed25519|authorized_keys|known_hosts))\b/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "data_exfiltration",
  },
  {
    id: "DE002",
    name: "Password File Access",
    description: "Reading system password files",
    severity: SEVERITY.HIGH,
    pattern: /\bcat\s+\/etc\/passwd\b/i,
    fileTypes: [".sh", ".bash"],
    category: "data_exfiltration",
  },
  {
    id: "DE003",
    name: "SCP / Rsync to External Host",
    description: "Copying files to an external server",
    severity: SEVERITY.HIGH,
    pattern: /\b(scp|rsync)\b\s+.*\s+\S+@\S+:/i,
    fileTypes: [".sh", ".bash"],
    category: "data_exfiltration",
  },
  {
    id: "DE004",
    name: "Exfiltration via Curl POST",
    description: "Sending file data to external server via curl POST",
    severity: SEVERITY.HIGH,
    pattern: /\bcurl\b.*(-X\s+POST|--data|--upload-file|-F\s+['"]?file).*https?:\/\//i,
    fileTypes: [".sh", ".bash"],
    category: "data_exfiltration",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Slurm Manipulation
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "SM001",
    name: "Slurm Configuration Tampering",
    description: "Modifying Slurm control or configuration",
    severity: SEVERITY.CRITICAL,
    pattern: /\bscontrol\s+update\b/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "slurm_manipulation",
  },
  {
    id: "SM002",
    name: "Slurm Account Manager",
    description: "Using sacctmgr to modify accounts/QOS",
    severity: SEVERITY.CRITICAL,
    pattern: /\bsacctmgr\s+(add|modify|delete|remove|create)\b/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "slurm_manipulation",
  },
  {
    id: "SM003",
    name: "Slurm Config File Modification",
    description: "Editing Slurm configuration files",
    severity: SEVERITY.CRITICAL,
    pattern: />\s*\/?.*slurm\.conf|sed\s+.*slurm\.conf|vi\s+.*slurm\.conf/i,
    fileTypes: [".sh", ".bash"],
    category: "slurm_manipulation",
  },
  {
    id: "SM004",
    name: "Cancelling Other Users' Jobs",
    description: "Using scancel to cancel jobs",
    severity: SEVERITY.HIGH,
    pattern: /\bscancel\b/i,
    fileTypes: [".sh", ".bash", ".py"],
    category: "slurm_manipulation",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Kernel / System Tampering
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "KS001",
    name: "Kernel Module Manipulation",
    description: "Loading or removing kernel modules",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(insmod|rmmod|modprobe)\s+\S/i,
    fileTypes: [".sh", ".bash"],
    category: "kernel_system",
  },
  {
    id: "KS002",
    name: "Sysctl Modification",
    description: "Modifying kernel parameters at runtime",
    severity: SEVERITY.HIGH,
    pattern: /\bsysctl\s+-w\s/i,
    fileTypes: [".sh", ".bash"],
    category: "kernel_system",
  },
  {
    id: "KS003",
    name: "Writing to /proc or /sys",
    description: "Writing to kernel parameter filesystem",
    severity: SEVERITY.HIGH,
    pattern: /echo\s+.*>\s*\/(proc|sys)\//i,
    fileTypes: [".sh", ".bash"],
    category: "kernel_system",
  },
  {
    id: "KS004",
    name: "Process Kill (Mass)",
    description: "Killing processes with signal 9 (force kill)",
    severity: SEVERITY.HIGH,
    pattern: /\bkill\s+-9\s+(-1|0)\b|\bkillall\s+/i,
    fileTypes: [".sh", ".bash"],
    category: "kernel_system",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Firewall / Network Manipulation
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "FW001",
    name: "Firewall Rule Modification",
    description: "Modifying firewall rules",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(iptables|ip6tables|nftables|ufw)\s+(-A|--append|-I|--insert|-D|--delete|enable|disable|allow|deny)/i,
    fileTypes: [".sh", ".bash"],
    category: "firewall",
  },
  {
    id: "FW002",
    name: "SSH Tunnel / Port Forwarding",
    description: "Creating SSH tunnels for port forwarding",
    severity: SEVERITY.HIGH,
    pattern: /\bssh\b.*(-L\s+\d+|-R\s+\d+|-D\s+\d+)\s/i,
    fileTypes: [".sh", ".bash"],
    category: "firewall",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Malware Persistence
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "MP001",
    name: "Crontab Manipulation",
    description: "Adding or modifying crontab entries",
    severity: SEVERITY.HIGH,
    pattern: /\bcrontab\b.*(-l\s*\||-e)|echo\s+.*>.*crontab|\/etc\/cron\.\w+\//i,
    fileTypes: [".sh", ".bash"],
    category: "malware_persistence",
  },
  {
    id: "MP002",
    name: "Systemd Service Creation",
    description: "Creating or enabling systemd services for persistence",
    severity: SEVERITY.HIGH,
    pattern: /systemctl\s+(enable|start)\s|>\s*\/etc\/systemd\/system\/\S+\.service/i,
    fileTypes: [".sh", ".bash"],
    category: "malware_persistence",
  },
  {
    id: "MP003",
    name: "SSH Authorized Keys Modification",
    description: "Writing to SSH authorized_keys for backdoor access",
    severity: SEVERITY.CRITICAL,
    pattern: />\s*~?\/?.*\.ssh\/authorized_keys|>>.*\.ssh\/authorized_keys/i,
    fileTypes: [".sh", ".bash"],
    category: "malware_persistence",
  },
  {
    id: "MP004",
    name: "Bash Profile/RC Injection",
    description: "Modifying shell profile for persistence",
    severity: SEVERITY.HIGH,
    pattern: />>\s*~?\/?.*\.(bashrc|bash_profile|profile|zshrc)\b/i,
    fileTypes: [".sh", ".bash"],
    category: "malware_persistence",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Container Escape
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "CE001",
    name: "Docker Socket Access",
    description: "Accessing Docker socket for container escape",
    severity: SEVERITY.CRITICAL,
    pattern: /\/var\/run\/docker\.sock|docker\s+run\s+.*-v\s+\//i,
    fileTypes: null,
    category: "container_escape",
  },
  {
    id: "CE002",
    name: "Namespace Enter (nsenter)",
    description: "Using nsenter for container escape",
    severity: SEVERITY.CRITICAL,
    pattern: /\bnsenter\s+/i,
    fileTypes: [".sh", ".bash"],
    category: "container_escape",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Exploit Tools / Frameworks
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "ET001",
    name: "Exploitation Framework",
    description: "Usage of known exploitation frameworks",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(metasploit|msfconsole|msfvenom|meterpreter|cobalt\s*strike|empire|powershell\s*empire|responder|impacket|mimikatz|lazagne|bloodhound|crackmapexec)\b/i,
    fileTypes: null,
    category: "exploit_tools",
  },
  {
    id: "ET002",
    name: "Payload Generation Tool",
    description: "Generating payloads for exploitation",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(msfvenom|veil-evasion|shellter|unicorn\.py)\b/i,
    fileTypes: null,
    category: "exploit_tools",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: DoS / Resource Abuse
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "DA001",
    name: "Memory Bomb (Python)",
    description: "Allocating excessive memory intentionally",
    severity: SEVERITY.HIGH,
    pattern: /['"]\s*[A-Za-z]\s*['"]\s*\*\s*\d{8,}/i,
    fileTypes: [".py"],
    category: "resource_abuse",
  },
  {
    id: "DA002",
    name: "Disk Fill Attack",
    description: "Writing /dev/urandom or /dev/zero to disk to fill it",
    severity: SEVERITY.CRITICAL,
    pattern: /\bdd\b.*if\s*=\s*\/dev\/(urandom|zero).*of\s*=\s*(?!\/dev\/)/i,
    fileTypes: [".sh", ".bash"],
    category: "resource_abuse",
  },
  {
    id: "DA003",
    name: "Infinite Loop with System Commands",
    description: "Infinite loop executing system-taxing commands",
    severity: SEVERITY.HIGH,
    pattern: /while\s+(true|1|:)\s*;?\s*do[\s\S]{0,200}(wget|curl|ping|nc|dd)\b/i,
    fileTypes: [".sh", ".bash"],
    category: "resource_abuse",
  },
  {
    id: "DA004",
    name: "DoS Tool",
    description: "Known denial-of-service tools",
    severity: SEVERITY.CRITICAL,
    pattern: /\b(slowloris|goldeneye|hulk|torshammer|hping3|loic|hoic)\b/i,
    fileTypes: null,
    category: "resource_abuse",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Config file threats (YAML/JSON/CFG specific)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "CF001",
    name: "YAML Deserialization Attack",
    description: "Unsafe YAML deserialization with Python/Ruby tag",
    severity: SEVERITY.CRITICAL,
    pattern: /!!python\/(object|module|apply|name)|!!ruby\//i,
    fileTypes: [".yaml", ".yml"],
    category: "config_threat",
  },
  {
    id: "CF002",
    name: "Suspicious External URLs in Config",
    description: "Config pointing to known malicious or mining endpoints",
    severity: SEVERITY.HIGH,
    pattern: /(stratum|mining|pool|miner|exploit|payload|reverse.?shell|backdoor)\S*\.(com|net|org|io|onion)/i,
    fileTypes: [".json", ".yaml", ".yml", ".cfg", ".conf", ".ini", ".toml"],
    category: "config_threat",
  },
];


// ─── Scanner Logic ───────────────────────────────────────────────────────────

/**
 * Check if a line is a comment (should be excluded from certain rules)
 * @param {string} line - the line of code
 * @param {string} ext - file extension
 * @returns {boolean}
 */
function isCommentLine(line, ext) {
  const trimmed = line.trim();
  if ([".sh", ".bash", ".py", ".yaml", ".yml", ".cfg", ".conf", ".ini", ".toml"].includes(ext)) {
    if (trimmed.startsWith("#")) return true;
  }
  if (ext === ".py") {
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) return true;
    if (trimmed.startsWith("//")) return true;
  }
  return false;
}

/**
 * Scan a single file content against all applicable rules
 * @param {string} fileName - the file name/path within the ZIP
 * @param {string} content - the file content as a string
 * @returns {Array} array of threat objects
 */
function scanFileContent(fileName, content) {
  const ext = path.extname(fileName).toLowerCase();
  const threats = [];
  const lines = content.split("\n");

  for (const rule of RULES) {
    // Check if rule applies to this file type
    if (rule.fileTypes !== null && !rule.fileTypes.includes(ext)) {
      continue;
    }

    // For multi-line patterns, scan the full content
    if (rule.pattern.source.includes("[\\s\\S]")) {
      const match = rule.pattern.exec(content);
      if (match) {
        // Find which line the match starts at
        const matchIndex = match.index;
        let lineNum = 1;
        let charCount = 0;
        for (const line of lines) {
          charCount += line.length + 1; // +1 for newline
          if (charCount > matchIndex) break;
          lineNum++;
        }
        threats.push({
          file: fileName,
          line: lineNum,
          rule: rule.name,
          ruleId: rule.id,
          severity: rule.severity,
          category: rule.category,
          description: rule.description,
          match: match[0].substring(0, 100).trim(), // truncate for display
        });
      }
    } else {
      // Line-by-line scanning for single-line patterns
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip comment lines for most rules (reduces false positives)
        if (isCommentLine(line, ext)) continue;

        const match = rule.pattern.exec(line);
        if (match) {
          threats.push({
            file: fileName,
            line: i + 1,
            rule: rule.name,
            ruleId: rule.id,
            severity: rule.severity,
            category: rule.category,
            description: rule.description,
            match: match[0].substring(0, 100).trim(),
          });
          break; // one match per rule per file is enough
        }
      }
    }
  }

  return threats;
}

/**
 * Scan a ZIP file for security threats
 * @param {string} zipFilePath - absolute path to the ZIP file on disk
 * @returns {{ safe: boolean, threats: Array, filesScanned: number, rulesApplied: number }}
 */
function scanZipFile(zipFilePath) {
  const zip = new AdmZip(zipFilePath);
  const entries = zip.getEntries();
  const allThreats = [];
  let filesScanned = 0;

  for (const entry of entries) {
    // Skip directories
    if (entry.isDirectory) continue;

    const ext = path.extname(entry.entryName).toLowerCase();

    // Only scan recognized file types
    if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

    filesScanned++;

    try {
      const content = entry.getData().toString("utf8");
      const threats = scanFileContent(entry.entryName, content);
      allThreats.push(...threats);
    } catch (err) {
      console.warn(`[SecurityScanner] Could not read entry ${entry.entryName}: ${err.message}`);
    }
  }

  return {
    safe: allThreats.length === 0,
    threats: allThreats,
    filesScanned,
    rulesApplied: RULES.length,
  };
}

module.exports = {
  scanZipFile,
  RULES,
  SEVERITY,
};
