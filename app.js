const $ = (id) => document.getElementById(id);
let token = localStorage.getItem("ruang_token") || "";
let currentUser = null;
let authMode = "register";

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
  return data;
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function avatarHTML(user, cls = "avatar") {
  if (user.avatar) return `<img class="${cls}" src="${escapeHTML(user.avatar)}" alt="Foto profil">`;
  return `<div class="${cls} avatar-placeholder">${escapeHTML((user.username || "?")[0].toUpperCase())}</div>`;
}
function showModal(id) { $(id).classList.remove("hidden"); }
function hideModals() { $("authModal").classList.add("hidden"); $("editModal").classList.add("hidden"); }
function openAuth(mode = "register") { setAuthMode(mode); showModal("authModal"); }
function setAuthMode(mode) {
  authMode = mode;
  $("registerTab").classList.toggle("active", mode === "register");
  $("loginTab").classList.toggle("active", mode === "login");
  $("authTitle").textContent = mode === "register" ? "Buat akun baru" : "Selamat datang kembali";
  $("authSubtitle").textContent = mode === "register" ? "Pilih nama pengguna dan password untuk mulai bergabung." : "Masuk dan lanjutkan ceritamu.";
  $("authSubmit").textContent = mode === "register" ? "Buat akun ↗" : "Masuk ↗";
  $("password").autocomplete = mode === "register" ? "new-password" : "current-password";
  $("authMessage").textContent = "";
}
function renderProfile() {
  $("accountBtn").textContent = currentUser ? "Keluar" : "Masuk / Daftar";
  if (!currentUser) {
    $("profileContent").innerHTML = `<div class="avatar-placeholder">?</div><h3>Belum masuk</h3><p>Buat akun untuk memiliki profil dan mulai berbagi.</p><button class="outline-btn" id="profileJoinAgain">Buat akun</button>`;
    $("profileJoinAgain").onclick = () => openAuth("register");
    $("composer").classList.add("hidden");
    return;
  }
  $("profileContent").innerHTML = `<div class="profile-user">${avatarHTML(currentUser)}<h3>${escapeHTML(currentUser.username)}</h3><p>${escapeHTML(currentUser.description || "Belum ada deskripsi.")}</p><div class="profile-buttons"><button class="outline-btn" id="editProfileBtn">Edit profil</button><button class="outline-btn" id="logoutBtn">Keluar</button></div></div>`;
  $("editProfileBtn").onclick = openEditProfile;
  $("logoutBtn").onclick = logout;
  $("composer").classList.remove("hidden");
  $("composerAvatar").innerHTML = currentUser.avatar ? `<img src="${escapeHTML(currentUser.avatar)}" alt="">` : escapeHTML(currentUser.username[0].toUpperCase());
}
async function loadMe() {
  if (!token) { currentUser = null; renderProfile(); return; }
  try { currentUser = (await api("/api/me")).user; }
  catch { token = ""; localStorage.removeItem("ruang_token"); currentUser = null; }
  renderProfile();
}
async function loadPosts() {
  const { posts } = await api("/api/posts");
  if (!posts.length) {
    $("feedList").innerHTML = `<div class="empty-feed">Belum ada postingan. Jadilah orang pertama yang berbagi cerita ✦</div>`;
    return;
  }
  $("feedList").innerHTML = posts.map(post => `
    <article class="post">
      <div class="post-head">${avatarHTML(post.user)}<div class="post-meta"><strong>${escapeHTML(post.user.username)}</strong><span>${new Date(post.createdAt + "Z").toLocaleString("id-ID", { dateStyle:"medium", timeStyle:"short" })}</span></div></div>
      <div class="post-content">${escapeHTML(post.content)}</div>
      ${currentUser && currentUser.id === post.user.id ? `<div class="post-bottom"><button class="delete-post" data-delete="${post.id}">Hapus postingan</button></div>` : ""}
    </article>`).join("");
  document.querySelectorAll("[data-delete]").forEach(btn => btn.onclick = async () => {
    if (!confirm("Hapus postingan ini?")) return;
    try { await api(`/api/posts/${btn.dataset.delete}`, { method:"DELETE" }); await loadPosts(); }
    catch (e) { alert(e.message); }
  });
}
async function refresh() { await loadMe(); await loadPosts(); }
function logout() {
  token = ""; currentUser = null; localStorage.removeItem("ruang_token"); renderProfile(); loadPosts();
}
function openEditProfile() {
  $("descriptionInput").value = currentUser.description || "";
  $("avatarInput").value = "";
  $("profileMessage").textContent = "";
  showModal("editModal");
}

$("accountBtn").onclick = () => currentUser ? logout() : openAuth("login");
$("heroJoin").onclick = () => openAuth("register");
$("profileJoin").onclick = () => openAuth("register");
$("registerTab").onclick = () => setAuthMode("register");
$("loginTab").onclick = () => setAuthMode("login");
document.querySelectorAll("[data-close]").forEach(el => el.onclick = hideModals);
$("authForm").onsubmit = async e => {
  e.preventDefault();
  const button = $("authSubmit"); button.disabled = true;
  $("authMessage").textContent = "Memproses...";
  try {
    const data = await api(authMode === "register" ? "/api/register" : "/api/login", {
      method:"POST", body:JSON.stringify({ username:$("username").value, password:$("password").value })
    });
    token = data.token; localStorage.setItem("ruang_token", token);
    currentUser = data.user; hideModals(); $("authForm").reset(); await refresh();
  } catch (err) { $("authMessage").textContent = err.message; }
  finally { button.disabled = false; }
};
$("profileForm").onsubmit = async e => {
  e.preventDefault();
  const msg = $("profileMessage"); msg.className = "form-message"; msg.textContent = "Menyimpan...";
  try {
    const file = $("avatarInput").files[0];
    if (file) {
      const form = new FormData(); form.append("avatar", file);
      const result = await api("/api/profile/avatar", { method:"POST", body:form });
      currentUser = result.user;
    }
    const result = await api("/api/profile", { method:"PATCH", body:JSON.stringify({ description:$("descriptionInput").value }) });
    currentUser = result.user; msg.className = "form-message success"; msg.textContent = "Profil berhasil diperbarui.";
    renderProfile(); setTimeout(hideModals, 650);
  } catch (err) { msg.textContent = err.message; }
};
$("postContent").oninput = () => $("charCount").textContent = `${$("postContent").value.length} / 2000`;
$("postBtn").onclick = async () => {
  const content = $("postContent").value.trim(); if (!content) return;
  $("postBtn").disabled = true;
  try { await api("/api/posts", { method:"POST", body:JSON.stringify({ content }) }); $("postContent").value = ""; $("charCount").textContent = "0 / 2000"; await loadPosts(); }
  catch (e) { alert(e.message); }
  finally { $("postBtn").disabled = false; }
};
refresh().catch(() => $("feedList").innerHTML = `<div class="empty-feed">Tidak bisa memuat postingan. Coba muat ulang halaman.</div>`);
