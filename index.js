const fs = require("fs");
const path = require("path");
const csvParser = require("csv-parser");
const request = require("request");
require("dotenv").config();
const Web3 = require("web3");
const Tx = require("ethereumjs-tx").Transaction;

const TATUM_API_KEY = process.env.TATUM_API_KEY;
const WALLET_PRIVATE_KEY = process.env.WALLET_PVT_KEY;
const RPC_URI_ETH = process.env.RPC_URI_ETH;
const {
  address: CONTRACT_ADDRESS,
  abi: CONTRACT_ABI,
} = require("./blockchain/contracts/1.json");

const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URI_ETH));
const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
const USER_PVT_KEY = web3.eth.accounts.privateKeyToAccount(WALLET_PRIVATE_KEY);

const nfts = [];
const metadataFiles = [];
const ipfsMetaFiles = [];

console.log("\n[*] Reading csv file ...");

// Sleep till given seconds
const sleep = (seconds) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), 1000 * seconds);
  });
};

const startScript = () => {
  fs.createReadStream("./csvs/NFTs to Mint - NY.csv")
    .pipe(csvParser())
    .on("data", (data) => {
      let attributes = [
        {
          trait_type: data["Prop 1"],
          value: data["Prop 1 Desc"],
        },
        {
          trait_type: data["Prop 2"],
          value: data["Prop 2 Desc"],
        },
        {
          trait_type: data["Prop 3"],
          value: data["Prop 3 Desc"],
        },
        // Example (if we have Prop 4 colum in csv)
        // {
        //   trait_type: data["Prop 4"],
        //   value: data["Prop 4 Desc"],
        // },
      ];

      let nftData = {
        id: data["ID"],
        name: data["Name of NFT"],
        description: data["ItemDescription"],
        // type: data["Symbol"],
        image: "",
        attributes,
      };
      nfts.push(nftData);
    })
    .on("end", async (err) => {
      if (err) {
        console.log("err: ", err);
      } else {
        console.log("[*] Total NFTs :", nfts.length);

        let tatumApiCallCounter = 0;
        for (nft of nfts) {
          const imageName = nft.name + ".jpg";

          const imageFilePath = path.resolve(
            __dirname + `/images/NFTs Districts/${nft.id}.jpg`.trim()
          );

          const jsonFilePath = path.resolve(
            __dirname + `/meta-data/${nft.id}.json`
          );

          // Check if the image has already been uploaded and has respective JSON file
          if (fs.existsSync(jsonFilePath)) {
            console.log("[*] file exists, skipping ");
            metadataFiles.push({ name: nft.name, file: jsonFilePath });
            continue;
          }

          // Upload Image to IPFS
          const [ipfsHash, error] = await uploadToIPFS(
            imageName,
            imageFilePath
          );
          tatumApiCallCounter += 1;

          if (ipfsHash) {
            // write JSON file

            // https://ipfs.io/ipfs/bafkreica3fmehqzci65a6azuq65j74h7mcwwydz7q7o4rywcaoeeslxppa
            nft.image = `https://ipfs.io/ipfs/${ipfsHash}`;
            delete nft["id"];

            fs.writeFileSync(jsonFilePath, JSON.stringify(nft));
            console.log("[+] NFT image uploaded on IPFS ");
            metadataFiles.push({ name: nft.name, file: jsonFilePath });

            // Put delay of 2s after every 5 requests - Free Plan rate limit: 5 reqs/second
            if (tatumApiCallCounter === 4) {
              tatumApiCallCounter = 0;
              console.log("[*] Sleeping for 2 seconds ...");
              await sleep(2);
            }
          } else {
            console.log("[-] error in meta for nft: " + error);
          }
        }

        // Uploading metadata json files Metadata
        console.log("[+] Total JSON files: ", metadataFiles.length);
        let tokenUris = fs.readFileSync(
          path.resolve(__dirname + "/nftMetaDataFile.json"),
          "utf-8"
        );
        tokenUris = JSON.parse(tokenUris);

        tatumApiCallCounter = 0;
        for (file of metadataFiles) {
          const [ipfsHash, error] = await uploadToIPFS(file.name, file.file);
          if (ipfsHash) {
            console.log("[+] meta-data json uploaded: ");
            // https://ipfs.io/ipfs/bafkreibrm5agimlurv4zkupokciv22qfj43ovgadyuj43gwuktxyw5usp4
            ipfsMetaFiles.push({
              name: file.name,
              uri: `https://ipfs.io/ipfs/${ipfsHash}`,
            });

            // Put delay of 2s after every 5 requests - Free Plan rate limit: 5 reqs/second
            if (tatumApiCallCounter === 4) {
              tatumApiCallCounter = 0;
              console.log("[*] Sleeping for 2 seconds ...");
              await sleep(2);
            }

            const token_id = Date.now();
            console.log("[*] Minting started ... ");
            await mintNft(token_id, `https://ipfs.io/ipfs/${ipfsHash}`);
          } else {
            console.log("[-] error in meta-json upload: ", +error);
          }
        }
        // write the json file for ipfsMetaFiles
        fs.writeFileSync(
          path.resolve(__dirname + "/nftMetaDataFile.json"),
          JSON.stringify(ipfsMetaFiles)
        );

        console.log("[*] Job done ...");
      }
    });
};

const uploadToIPFS = (fileName, filePath) => {
  return new Promise((res, rej) => {
    let options = {
      method: "POST",
      url: "https://api-eu1.tatum.io/v3/ipfs",
      headers: {
        "x-api-key": TATUM_API_KEY,
        Connection: "keep-alive",
      },
      formData: {
        file: {
          value: fs.createReadStream(filePath),
          options: {
            filename: fileName,
            contentType: null,
          },
        },
      },
    };

    request(options, function (error, response) {
      try {
        if (error) throw new Error(error);
        const { ipfsHash } = JSON.parse(response.body);
        res([ipfsHash, null]);
      } catch (error) {
        res([null, error.message]);
      }
    });
  });
};

const mintNft = async (token_id, ipfs_uri) => {
  try {
    const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

    const mintToken = await contract.methods
      .mint(USER_PVT_KEY.address, token_id, ipfs_uri, "Vorbit Description")
      .encodeABI();

    if (!mintToken) {
      console.log("[-] Error in minting");
      return null;
    }

    let transactionAttempt = 0;
    let transactionStatus = null;
    do {
      transactionAttempt += 1;
      transactionStatus = await startTransaction(mintToken);
      if (transactionAttempt > 1)
        console.log(`[*] Attempting transaction ${transactionAttempt} time`);
    } while (transactionStatus === null);
  } catch (error) {
    return null;
  }
};

async function startTransaction(mintToken) {
  return new Promise((resolve, reject) => {
    web3.eth.getTransactionCount(USER_PVT_KEY.address, async (err, txCount) => {
      // Build the transaction
      const txObject = {
        nonce: web3.utils.toHex(txCount),
        to: CONTRACT_ADDRESS,
        value: web3.utils.toHex(web3.utils.toWei("0", "ether")),
        gasLimit: web3.utils.toHex(2100000),
        gasPrice: web3.utils.toHex(web3.utils.toWei("6", "gwei")),
        data: mintToken,
      };
      const tx = new Tx(txObject, { chain: "rinkeby" });
      let privateKey1 = Buffer.from(WALLET_PRIVATE_KEY, "hex");
      tx.sign(privateKey1);

      const serializedTx = tx.serialize();
      const raw = "0x" + serializedTx.toString("hex");
      // Broadcast the transaction
      const transaction = await web3.eth.sendSignedTransaction(raw);
      if (!transaction) {
        console.log("[-] Error in transaction: ");
        return resolve(null);
      }
      console.log(
        "[*] Transaction success, token has been minted and uploaded on OpenSea"
      );
      return resolve("done");
    });
  });
}

startScript();
