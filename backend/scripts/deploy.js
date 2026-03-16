const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

async function main() {
  const IconMarketplace = await hre.ethers.getContractFactory("IconMarketplace");
  const contract = await IconMarketplace.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("IconMarketplace deployed to:", address);

  const output = {
    network: hre.network.name,
    contract: address,
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(__dirname, "..", `deployment-${hre.network.name}.json`),
    JSON.stringify(output, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
