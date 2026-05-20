// ============================================
// R2 Storage Checker
// Uses AWS SDK v2 (browser) with S3-compatible API
// ============================================

const STORAGE_KEY = "r2_checker_creds_v1";

// ---------- DOM elements ----------
const form = document.getElementById("r2Form");
const accountIdEl = document.getElementById("accountId");
const bucketNameEl = document.getElementById("bucketName");
const accessKeyEl = document.getElementById("accessKey");
const secretKeyEl = document.getElementById("secretKey");
const rememberEl = document.getElementById("rememberMe");
const clearBtn = document.getElementById("clearStorage");
const toggleSecretBtn = document.getElementById("toggleSecret");
const checkBtn = document.getElementById("checkBtn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const totalObjectsEl = document.getElementById("totalObjects");
const totalSizeEl = document.getElementById("totalSize");
const bucketLabelEl = document.getElementById("bucketLabel");
const fileListEl = document.getElementById("fileList");

// ---------- Load saved credentials ----------
(function loadSaved() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    accountIdEl.value = data.accountId || "";
    bucketNameEl.value = data.bucketName || "";
    accessKeyEl.value = data.accessKey || "";
    secretKeyEl.value = data.secretKey || "";
    rememberEl.checked = true;
  } catch (e) {
    console.warn("Failed to load saved credentials", e);
  }
})();

// ---------- Toggle secret visibility ----------
toggleSecretBtn.addEventListener("click", () => {
  secretKeyEl.type = secretKeyEl.type === "password" ? "text" : "password";
});

// ---------- Clear saved ----------
clearBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  accountIdEl.value = "";
  bucketNameEl.value = "";
  accessKeyEl.value = "";
  secretKeyEl.value = "";
  rememberEl.checked = false;
  showStatus("✅ Saved credentials cleared.", "success");
});

// ---------- Helpers ----------
function showStatus(message, type = "loading") {
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
}

function hideStatus() {
  statusEl.classList.add("hidden");
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

// ---------- Main check ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const accountId = accountIdEl.value.trim();
  const bucketName = bucketNameEl.value.trim();
  const accessKey = accessKeyEl.value.trim();
  const secretKey = secretKeyEl.value.trim();

  if (!accountId || !bucketName || !accessKey || !secretKey) {
    showStatus("⚠️ အကွက်အားလုံးထည့်ပါ", "error");
    return;
  }

  // Remember
  if (rememberEl.checked) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accountId, bucketName, accessKey, secretKey })
    );
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }

  // Configure S3 client to point to R2
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  const s3 = new AWS.S3({
    endpoint: endpoint,
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    signatureVersion: "v4",
    region: "auto",
    s3ForcePathStyle: true,
  });

  checkBtn.disabled = true;
  resultEl.classList.add("hidden");
  showStatus("⏳ Connecting to R2 ...", "loading");

  try {
    let continuationToken = undefined;
    let totalObjects = 0;
    let totalSize = 0;
    let allFiles = [];
    let page = 0;

    do {
      page++;
      showStatus(`⏳ Loading page ${page} ... (${totalObjects} objects so far)`, "loading");

      const params = {
        Bucket: bucketName,
        MaxKeys: 1000,
      };
      if (continuationToken) params.ContinuationToken = continuationToken;

      const data = await s3.listObjectsV2(params).promise();

      if (data.Contents) {
        for (const obj of data.Contents) {
          totalObjects++;
          totalSize += obj.Size || 0;
          allFiles.push({ key: obj.Key, size: obj.Size || 0 });
        }
      }

      continuationToken = data.IsTruncated ? data.NextContinuationToken : null;
    } while (continuationToken);

    // Display result
    totalObjectsEl.textContent = totalObjects.toLocaleString();
    totalSizeEl.textContent = formatBytes(totalSize);
    bucketLabelEl.textContent = bucketName;

    // Top 20 largest files
    allFiles.sort((a, b) => b.size - a.size);
    const topFiles = allFiles.slice(0, 20);
    fileListEl.innerHTML = topFiles
      .map(
        (f) =>
          `<div class="file-row"><span class="file-name" title="${escapeHtml(
            f.key
          )}">${escapeHtml(f.key)}</span><span>${formatBytes(f.size)}</span></div>`
      )
      .join("");

    resultEl.classList.remove("hidden");
    showStatus(`✅ Done! Found ${totalObjects.toLocaleString()} objects.`, "success");
  } catch (err) {
    console.error(err);
    let msg = err.message || String(err);
    if (err.code === "NetworkingError" || msg.includes("Failed to fetch")) {
      msg += " — CORS configure မှန်/မမှန် ပြန်စစ်ပါ။";
    }
    showStatus(`❌ Error: ${msg}`, "error");
  } finally {
    checkBtn.disabled = false;
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
