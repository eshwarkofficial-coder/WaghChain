
import json, os
from web3 import Web3
from solcx import compile_standard, install_solc


RPC_URL = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
PRIVATE_KEY = os.environ.get("PRIVATE_KEY") 
ACCOUNT_INDEX = int(os.environ.get("ACCOUNT_INDEX", "0"))

ROOT = os.path.dirname(os.path.dirname(__file__))
CONTRACTS_PATH = os.path.join(ROOT, "contracts", "Social.sol")
STATIC_DIR = os.path.join(ROOT, "static")
os.makedirs(STATIC_DIR, exist_ok=True)

print(f"Connecting to {RPC_URL} ...")
w3 = Web3(Web3.HTTPProvider(RPC_URL))
assert w3.is_connected(), "Could not connect to RPC. Is your local node running?"


if PRIVATE_KEY:
    account = w3.eth.account.from_key(PRIVATE_KEY)
    sender = account.address
else:
    accounts = w3.eth.accounts
    assert len(accounts) > 0, "No unlocked accounts available on the node."
    sender = accounts[ACCOUNT_INDEX]
print("Sender:", sender)


source = open(CONTRACTS_PATH, "r", encoding="utf-8").read()


install_solc("0.8.20")

compiled = compile_standard(
    {
        "language": "Solidity",
        "sources": {"Social.sol": {"content": source}},
        "settings": {
            "outputSelection": {"*": {"*": ["abi", "evm.bytecode"]}},
            "optimizer": {"enabled": True, "runs": 200},
        },
    },
    solc_version="0.8.20",
)

abi = compiled["contracts"]["Social.sol"]["Social"]["abi"]
bytecode = compiled["contracts"]["Social.sol"]["Social"]["evm"]["bytecode"]["object"]


Social = w3.eth.contract(abi=abi, bytecode=bytecode)

if PRIVATE_KEY:
    chain_id = w3.eth.chain_id
    nonce = w3.eth.get_transaction_count(sender)
    tx = Social.constructor().build_transaction({
        "from": sender,
        "chainId": chain_id,
        "nonce": nonce,
        "gas": 3_000_000,
        # gas price fields are optional on dev chains; include for EIP-1559 capable nodes
        "maxFeePerGas": w3.to_wei("2", "gwei"),
        "maxPriorityFeePerGas": w3.to_wei("1", "gwei"),
    })
    signed = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
else:
    tx_hash = Social.constructor().transact({"from": sender})

print("Deploying, tx:", tx_hash.hex())
receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
address = receipt.contractAddress
print("Deployed Social at:", address)


chain_id = w3.eth.chain_id


out = {"address": address, "abi": abi, "chainId": chain_id}
with open(os.path.join(STATIC_DIR, "contract.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)

print("Wrote static/contract.json with chainId", chain_id)
