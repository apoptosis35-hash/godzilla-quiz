// アフィリエイトリンクのクリックを数える（ブラウザ内）。GA4 などを入れている場合はそちらにも送信。
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-product]");
  if (!a) return;
  const k = "aff-clicks", c = JSON.parse(localStorage.getItem(k) || "{}");
  c[a.dataset.product] = (c[a.dataset.product] || 0) + 1;
  localStorage.setItem(k, JSON.stringify(c));
  if (window.gtag) gtag("event", "affiliate_click", { product: a.dataset.product, link_text: a.textContent });
});
