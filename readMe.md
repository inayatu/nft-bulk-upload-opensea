# Upload Files to IPFS via tatum.io

- You need .csv files in correct format in "csvs" folder
- You need to have images to be uploaded in "images" folder
- Create nftMetaDataFile.json and put `[]` (emtpy array) as content

# Mint NFT on OpenSea with Rinkeby Network

- To mint the NFT you need contract address and contract abi in "blockchain/contracts/1.json" as ` {"address":"",abi:[]}`
- You need Infura RPC in the .env file
- You need your wallet's private key

### Third parties needed

- Create account on https://infura.io/
- Create account on https://tatum.io/

### How to run the script?

Once everything is ready i.e:

- Contract in the contract folder
- CSV file in the csvs folder
- images in the images folder
- meta mask wallet private key

then just run
`npm start`

### Note

sample .env file is attached
