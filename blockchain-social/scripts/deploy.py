
import json, os, time
from web3 import Web3
from solcx import compile_standard, install_solc

# Settings
RPC_URL = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
CHAIN_ID = int(os.environ.get("CHAIN_ID", "1337"))  # adjust if your node uses 5777 or 31337
PRIVATE_KEY = os.environ.get("PRIVATE_KEY")  # optional: if you want to sign txs with a local key
ACCOUNT_INDEX = int(os.environ.get("ACCOUNT_INDEX", "0"))

contracts_path = os.path.join(os.path.dirname(__file__), "..", "contracts", "Social.sol")
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
os.makedirs(static_dir, exist_ok=True)

print(f"Connecting to {RPC_URL} ...")
w3 = Web3(Web3.HTTPProvider(RPC_URL))
assert w3.is_connected(), "Could not connect to RPC. Is your local node running?"

# Pick a sender account
if PRIVATE_KEY:
    account = w3.eth.account.from_key(PRIVATE_KEY)
    sender = account.address
else:
    # Use the first unlocked account from local node (anvil/ganache/hardhat usually expose these)
    accounts = w3.eth.accounts
    assert len(accounts) > 0, "No unlocked accounts available on the node."
    sender = accounts[ACCOUNT_INDEX]

print("Sender:", sender)

# Read and compile
source = open(contracts_path, "r", encoding="utf-8").read()

# Ensure solc is available
install_solc("0.8.20")

compiled = compile_standard(
    {
        "language": "Solidity",
        "sources": {"Social.sol": {"content": source}},
        "settings": {
            "outputSelection": {"*": {"*": ["abi", "metadata", "evm.bytecode", "evm.sourceMap"]}},
            "optimizer": {"enabled": True, "runs": 200},
        },
    },
    solc_version="0.8.20",
)

abi = compiled["contracts"]["Social.sol"]["Social"]["abi"]
bytecode = compiled["contracts"]["Social.sol"]["Social"]["evm"]["bytecode"]["object"]

# Build and send deploy tx
Social = w3.eth.contract(abi=abi, bytecode=bytecode)

if PRIVATE_KEY:
    nonce = w3.eth.get_transaction_count(sender)
    tx = Social.constructor().build_transaction({
        "from": sender,
        "chainId": CHAIN_ID,
        "nonce": nonce,
        "gas": 3_000_000,
        "maxFeePerGas": w3.to_wei("2", "gwei"),
        "maxPriorityFeePerGas": w3.to_wei("1", "gwei"),
    })
    signed = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
else:
    # If the node has unlocked accounts, we can just call transact
    tx_hash = Social.constructor().transact({"from": sender})

print("Deploying, tx:", tx_hash.hex())
receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
address = receipt.contractAddress
print("Deployed Social at:", address)

# Write contract.json for the frontend
out = {"address": address, "abi": abi, "chainId": CHAIN_ID}
with open(os.path.join(static_dir, "contract.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)

print("Wrote static/contract.json")
