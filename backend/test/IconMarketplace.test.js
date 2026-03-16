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
    await market
      .connect(seller)
      .addIcon("SEO Pack", price, "enc://ciphertext-payload");

    expect(await market.iconCount()).to.equal(1);
    const icon = await market.icons(0);
    expect(icon.name).to.equal("SEO Pack");
    expect(icon.price).to.equal(price);
    expect(icon.seller).to.equal(seller.address);
    expect(icon.sold).to.equal(false);
    expect(icon.totalSales).to.equal(0);
    expect(icon.active).to.equal(true);
  });

  it("rejects invalid addIcon input", async function () {
    await expect(
      market
        .connect(seller)
        .addIcon("", ethers.parseEther("0.1"), "enc://x")
    ).to.be.revertedWith("Name cannot be empty");

    await expect(
      market.connect(seller).addIcon("Pack", 0, "enc://x")
    ).to.be.revertedWith("Price must be greater than zero");

    await expect(
      market.connect(seller).addIcon("Pack", ethers.parseEther("0.1"), "")
    ).to.be.revertedWith("Encrypted URL cannot be empty");
  });

  it("supports multiple different buyers", async function () {
    const price = ethers.parseEther("0.2");
    await market.connect(seller).addIcon("UI Kit", price, "enc://ui");

    await expect(() => market.connect(buyer).buyIcon(0, { value: price })).to.changeEtherBalances(
      [buyer, seller],
      [-price, price]
    );

    await expect(() => market.connect(other).buyIcon(0, { value: price })).to.changeEtherBalances(
      [other, seller],
      [-price, price]
    );

    expect(await market.hasUserPurchased(0, buyer.address)).to.equal(true);
    expect(await market.hasUserPurchased(0, other.address)).to.equal(true);

    const icon = await market.icons(0);
    expect(icon.sold).to.equal(true);
    expect(icon.totalSales).to.equal(2);
  });

  it("rejects duplicate buy from same user and wrong payment", async function () {
    const price = ethers.parseEther("0.2");
    await market.connect(seller).addIcon("UI Kit", price, "enc://ui");

    await expect(
      market.connect(seller).buyIcon(0, { value: price })
    ).to.be.revertedWith("Cannot buy your own icon");

    await expect(
      market.connect(buyer).buyIcon(0, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("Incorrect ETH amount");

    await market.connect(buyer).buyIcon(0, { value: price });
    await expect(
      market.connect(buyer).buyIcon(0, { value: price })
    ).to.be.revertedWith("Already purchased");
  });

  it("enforces purchase rights for encrypted URL", async function () {
    const price = ethers.parseEther("0.2");
    const encrypted = "enc://secret";
    await market.connect(seller).addIcon("UI Kit", price, encrypted);

    await expect(
      market.connect(buyer).getEncryptedDownloadURL(0)
    ).to.be.revertedWith("Not buyer");

    await market.connect(buyer).buyIcon(0, { value: price });
    expect(await market.connect(buyer).getEncryptedDownloadURL(0)).to.equal(
      encrypted
    );

    await expect(
      market.connect(other).getEncryptedDownloadURL(0)
    ).to.be.revertedWith("Not buyer");
  });

  it("handles invalid icon id edge cases", async function () {
    await expect(market.buyIcon(999, { value: 0 })).to.be.revertedWith(
      "Icon does not exist"
    );

    await expect(
      market.hasUserPurchased(999, seller.address)
    ).to.be.revertedWith("Icon does not exist");
  });

  it("allows seller to disable listing", async function () {
    const price = ethers.parseEther("0.2");
    await market.connect(seller).addIcon("UI Kit", price, "enc://ui");
    await market.connect(seller).setIconActive(0, false);

    await expect(
      market.connect(buyer).buyIcon(0, { value: price })
    ).to.be.revertedWith("Icon is inactive");
  });
});
