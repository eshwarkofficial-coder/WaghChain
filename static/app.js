
(() => {
  const connectBtn = document.getElementById('connectBtn');
  const postBtn = document.getElementById('postBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const statusEl = document.getElementById('status');
  const networkEl = document.getElementById('network');
  const contentEl = document.getElementById('content');
  const feedEl = document.getElementById('feed');

  let contract, signer, meta;

  function status(msg) { statusEl.textContent = msg; }
  function esc(s) {
    const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML;
  }
  function shortAddr(a) { return a.slice(0,6)+'…'+a.slice(-4); }

  async function loadMeta() {
    const res = await fetch('/contract.json');
    if (!res.ok) throw new Error('contract.json not found. Run: python scripts/deploy.py');
    meta = await res.json();
  }

  async function connect() {
    try {
      if (!window.ethereum) throw new Error('MetaMask not found. Please install MetaMask.');
      await loadMeta();

      await window.ethereum.request({ method: 'eth_requestAccounts' });

     const provider = new ethers.providers.Web3Provider(window.ethereum);
	signer = provider.getSigner();

      const addr = await signer.getAddress();

      // Switch to the chain from contract.json if needed
      const net = await provider.getNetwork();
      const currentChainId = Number(net.chainId);
      if (currentChainId !== Number(meta.chainId)) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + Number(meta.chainId).toString(16) }],
          });
        } catch (err) {
          if (err.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x' + Number(meta.chainId).toString(16),
                chainName: 'Local Dev Chain ' + meta.chainId,
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['http://127.0.0.1:8545'],
              }]
            });
          } else {
            throw err;
          }
        }
      }

      contract = new ethers.Contract(meta.address, meta.abi, signer);

      networkEl.textContent = `Connected: ${addr} | chainId=${meta.chainId}`;
      status('Wallet connected.');
      await refresh();
    } catch (e) {
      console.error(e);
      status('Error: ' + (e?.message || e));
    }
  }

  async function createPost() {
    const text = contentEl.value.trim();
    if (!text) return;
    postBtn.disabled = true;
    try {
      const tx = await contract.createPost(text);
      status('Posting... ' + tx.hash);
      await tx.wait();
      contentEl.value = '';
      status('Posted!');
      await refresh();
    } catch (e) {
      console.error(e);
      status('Error: ' + (e?.reason || e?.message || e));
    } finally {
      postBtn.disabled = false;
    }
  }

  async function likePost(id) {
    try {
      const tx = await contract.likePost(id);
      status('Liking... ' + tx.hash);
      await tx.wait();
      status('Liked!');
      await refresh();
    } catch (e) {
      console.error(e);
      status('Error: ' + (e?.reason || e?.message || e));
    }
  }

  async function refresh() {
    if (!contract) return;
    feedEl.innerHTML = '';
    const count = Number(await contract.getPostsCount());
    if (count === 0) {
      feedEl.innerHTML = '<div class="muted">No posts yet.</div>';
      return;
    }
    for (let i = count - 1; i >= 0 && i >= count - 50; i--) {
      const [author, content, ts, likes] = await contract.getPost(i);
      const when = new Date(Number(ts) * 1000).toLocaleString();
      const card = document.createElement('div');
      card.className = 'post';
      card.innerHTML = `
        <div>${esc(content)}</div>
        <div class="meta">
          <span class="addr" title="${author}">${shortAddr(author)}</span>
          <span class="muted small">${when} • Likes: ${likes}</span>
          <button class="like" data-id="${i}">Like</button>
        </div>
      `;
      card.querySelector('button.like').addEventListener('click', () => likePost(i));
      feedEl.appendChild(card);
    }
  }

  connectBtn.addEventListener('click', connect);
  postBtn.addEventListener('click', createPost);
  refreshBtn.addEventListener('click', refresh);
})();
