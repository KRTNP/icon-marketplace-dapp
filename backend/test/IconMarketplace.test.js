const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IconMarketplace", function () {
  let market;
  let seller;
  let buyer;
  let other;

  beforeEach(async function () {
    [seller, buyer, other] = await ethers.getSigners();
    const IconMarketplace = await ethers.getContractFactory("IconMarketplace");
    market = await IconMarketplace.deploy();
    await market.waitForDeployment();
  });

  it("adds icon with valid data", async function () {
    const price = ethers.parseEther("0.1");
    await market.connect(seller).addIcon("SEO Pack", price, "https://cdn.example/icon.zip");

    expect(await market.iconCount()).to.equal(1);
    const icon = await market.icons(0);
    expect(icon.name).to.equal("SEO Pack");
    expect(icon.price).to.equal(price);
    expect(icon.seller).to.equal(seller.address);
    expect(icon.sold).to.equal(false);
  });

  it("rejects invalid addIcon input", async function () {
    await expect(
      market.connect(seller).addIcon("", ethers.parseEther("0.1"), "https://cdn.example/x.zip")
    ).to.be.revertedWith("Name cannot be empty");

    await expect(
      market.connect(seller).addIcon("Pack", 0, "https://cdn.example/x.zip")
    ).to.be.revertedWith("Price must be greater than zero");

    await expect(
      market.connect(seller).addIcon("Pack", ethers.parseEther("0.1"), "")
    ).to.be.revertedWith("Icon URL cannot be empty");
  });

  it("buys icon with exact ETH and transfers to seller", async function () {
    const price = ethers.parseEther("0.2");
    await market.connect(seller).addIcon("UI Kit", price, "https://cdn.example/ui.zip");

    await expect(() => market.connect(buyer).buyIcon(0, { value: price }))
      .to.changeEtherBalances([buyer, seller], [-price, price]);

    const icon = await market.icons(0);
    expect(icon.sold).to.equal(true);
    expect(await market.iconBuyers(0)).to.equal(buyer.address);
  });

  it("rejects duplicate buy, self buy, wrong payment", async function () {
    const price = ethers.parseEther("0.2");
    await market.connect(seller).addIcon("UI Kit", price, "https://cdn.example/ui.zip");

    await expect(
      market.connect(seller).buyIcon(0, { value: price })
    ).to.be.revertedWith("Cannot buy your own icon");

    await expect(
      market.connect(buyer).buyIcon(0, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("Incorrect ETH amount");

    await market.connect(buyer).buyIcon(0, { value: price });
    await expect(
      market.connect(other).buyIcon(0, { value: price })
    ).to.be.revertedWith("Icon already sold");
  });

  it("unlocks download URL only for buyer", async function () {
    const price = ethers.parseEther("0.2");
    const url = "https://cdn.example/ui.zip";
    await market.connect(seller).addIcon("UI Kit", price, url);

    await expect(market.connect(buyer).getDownloadURL(0)).to.be.revertedWith("Icon not sold");

    await market.connect(buyer).buyIcon(0, { value: price });
    expect(await market.connect(buyer).getDownloadURL(0)).to.equal(url);

    await expect(market.connect(other).getDownloadURL(0)).to.be.revertedWith("Not buyer");
  });
});
