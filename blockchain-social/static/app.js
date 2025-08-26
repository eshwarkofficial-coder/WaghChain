
(async () => {
  const connectBtn = document.getElementById('connectBtn');
  const postBtn = document.getElementById('postBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const statusEl = document.getElementById('status');
  const networkEl = document.getElementById('network');
  const contentEl = document.getElementById('content');
  const feedEl = document.getElementById('feed');

  let provider;
  let signerAddress;
  let contract;

  // Basic provider using window.ethereum (MetaMask)
  async function getProvider() {
    if (!window.ethereum) {
      throw new Error('MetaMask (or any EIP-1193 provider) not found. Please install MetaMask.');
    }
    return window.ethereum;
  }

  async function loadContractMeta() {
    const res = await fetch('/contract.json');
    if (!res.ok) throw new Error('contract.json not found. Run `python scripts/deploy.py` first.');
    return res.json();
  }

  function toHex(n) { return '0x' + Number(n).toString(16); }
  function fromHex(h) { return parseInt(h, 16); }

  async function connect() {
    provider = await getProvider();
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    signerAddress = accounts[0];

    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    networkEl.textContent = `Connected: ${signerAddress} | chainId=${fromHex(chainIdHex)} (${chainIdHex})`;

    const meta = await loadContractMeta();
    // If wrong chain, offer to switch
    const desired = toHex(meta.chainId);
    if (chainIdHex !== desired) {
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: desired }] });
      } catch (err) {
        // If not added, add it
        if (err.code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: desired,
              chainName: `Local Chain ${meta.chainId}`,
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['http://127.0.0.1:8545'],
            }],
          });
        } else {
          console.warn('switch chain error', err);
        }
      }
    }

    // Build a tiny ethers-like wrapper with raw RPC
    contract = await makeContract(meta.address, meta.abi);
    status('Wallet connected.');
  }

  async function makeContract(address, abi) {
    // Minimal encoder for our ABI subset using ethers.js ABI coder would be ideal,
    // but to keep this pure JS without deps, we call via eth_call/eth_sendTransaction
    // using known method selectors:
    const selectors = {
      createPost: '0x5684ecc5', // keccak256("createPost(string)") -> first 4 bytes
      getPost:    '0x9d6f5a0f', // keccak256("getPost(uint256)")
      getPostsCount: '0x4873a1a0', // keccak256("getPostsCount()")
    };

    function encodeUint(v) {
      const hex = BigInt(v).to_bytes ? BigInt(v).toString(16) : v.toString(16);
      return hex.padStart(64, '0');
    }

    function encodeString(s) {
      // Very small encoder for dynamic string for single-arg function (createPost)
      // [selector][offset=20 bytes zero + 0x20][length][data][padding]
      const enc = new TextEncoder().encode(s);
      const lenHex = enc.length.toString(16).padStart(64, '0');
      const dataHex = Array.from(enc).map(b => b.toString(16).padStart(2,'0')).join('');
      // 32-byte words
      const paddedData = dataHex.padEnd(Math.ceil(enc.length / 32) * 64, '0');
      const offset = '0'.repeat(63) + '20'; // 0x20
      return selectors.createPost + offset + lenHex + paddedData;
    }

    async function rpc(method, params) {
      const res = await window.ethereum.request({ method, params });
      return res;
    }

    return {
      async createPost(content) {
        const data = encodeString(content);
        const tx = await rpc('eth_sendTransaction', [{
          from: signerAddress,
          to: address,
          data,
        }]);
        status('Posting... tx: ' + tx);
        // wait for receipt
        let receipt = null;
        while (!receipt) {
          await new Promise(r => setTimeout(r, 1000));
          receipt = await rpc('eth_getTransactionReceipt', [tx]);
        }
        status('Posted!');
      },
      async getPostsCount() {
        const data = selectors.getPostsCount;
        const res = await rpc('eth_call', [{
          to: address,
          data
        }, 'latest']);
        return Number(BigInt(res));
      },
      async getPost(id) {
        const idHex = encodeUint(id);
        const data = selectors.getPost + idHex;
        const res = await rpc('eth_call', [{
          to: address,
          data
        }, 'latest']);
        // Decode (address, string, uint256). For demo: naive decode using slicing.
        // 0: offset to address? Actually abi packs static first, but since string is dynamic,
        // layout is: address(32) | offset(32) | uint(32) | [dynamic area: offset-> length + data]
        // Simpler: we only decode `content` and `timestamp`, and we fetch author from logs if needed.
        const hex = res.replace(/^0x/, '');
        // address is right-padded in 32 bytes; last 40 hex chars are the address
        const author = '0x' + hex[24:64];  // not used in UI
        const offset = intFromHex(hex[64:128]);
        const timestamp = intFromHex(hex[128:192]);
        const strLenPos = offset * 2
        const strlen = intFromHex(hex[strLenPos:strLenPos+64]);
        const strDataStart = strLenPos + 64
        const strData = hex[strDataStart:strDataStart+strlen*2];
        const content = hexToString(strData);
        return { content, timestamp };
      }
    };
  }

  function intFromHex(h) { return Number(BigInt('0x' + h)); }
  function hexToString(h) {
    const bytes = [];
    for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.substr(i,2), 16));
    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  function status(msg) {
    statusEl.textContent = msg;
  }

  async function refresh() {
    if (!contract) return;
    feedEl.innerHTML = '';
    const count = await contract.getPostsCount();
    for (let i = count - 1; i >= 0 && i >= count - 50; i--) {
      const p = await contract.getPost(i);
      const el = document.createElement('div');
      el.className = 'post';
      const when = new Date(p.timestamp * 1000).toLocaleString();
      el.innerHTML = `<div>${escapeHtml(p.content)}</div><div class="muted small">${when}</div>`;
      feedEl.appendChild(el);
    }
    if (count === 0) feedEl.innerHTML = '<div class="muted">No posts yet.</div>';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  connectBtn.addEventListener('click', connect);
  postBtn.addEventListener('click', async () => {
    const text = contentEl.value.trim();
    if (!text) return;
    postBtn.disabled = true;
    try {
      await contract.createPost(text);
      contentEl.value = '';
      await refresh();
    } catch (e) {
      status('Error: ' + (e?.message || e));
      console.error(e);
    } finally {
      postBtn.disabled = false;
    }
  });
  refreshBtn.addEventListener('click', refresh);
})();
