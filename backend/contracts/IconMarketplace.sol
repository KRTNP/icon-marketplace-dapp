// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract IconMarketplace {
    struct Icon {
        uint256 id;
        string name;
        uint256 price;
        address payable seller;
        string encryptedIconURL;
        bool sold;
        uint256 totalSales;
        bool active;
    }

    mapping(uint256 => Icon) public icons;
    mapping(uint256 => mapping(address => bool)) private purchases;
    uint256 public iconCount;

    event IconAdded(
        uint256 indexed id,
        string name,
        uint256 price,
        address indexed seller
    );

    event IconPurchased(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 price,
        uint256 totalSales
    );

    function addIcon(
        string memory name,
        uint256 price,
        string memory encryptedIconURL
    ) external {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(price > 0, "Price must be greater than zero");
        require(
            bytes(encryptedIconURL).length > 0,
            "Encrypted URL cannot be empty"
        );

        uint256 iconId = iconCount;
        icons[iconId] = Icon({
            id: iconId,
            name: name,
            price: price,
            seller: payable(msg.sender),
            encryptedIconURL: encryptedIconURL,
            sold: false,
            totalSales: 0,
            active: true
        });

        iconCount += 1;
        emit IconAdded(iconId, name, price, msg.sender);
    }

    function buyIcon(uint256 iconId) external payable {
        require(iconId < iconCount, "Icon does not exist");

        Icon storage icon = icons[iconId];
        require(icon.active, "Icon is inactive");
        require(msg.sender != icon.seller, "Cannot buy your own icon");
        require(msg.value == icon.price, "Incorrect ETH amount");
        require(!purchases[iconId][msg.sender], "Already purchased");

        purchases[iconId][msg.sender] = true;
        icon.totalSales += 1;
        if (!icon.sold) {
            icon.sold = true;
        }

        icon.seller.transfer(msg.value);

        emit IconPurchased(
            iconId,
            msg.sender,
            icon.seller,
            icon.price,
            icon.totalSales
        );
    }

    function hasUserPurchased(
        uint256 iconId,
        address user
    ) external view returns (bool) {
        require(iconId < iconCount, "Icon does not exist");
        return purchases[iconId][user];
    }

    function getEncryptedDownloadURL(
        uint256 iconId
    ) external view returns (string memory) {
        require(iconId < iconCount, "Icon does not exist");
        require(purchases[iconId][msg.sender], "Not buyer");

        return icons[iconId].encryptedIconURL;
    }

    function setIconActive(uint256 iconId, bool active) external {
        require(iconId < iconCount, "Icon does not exist");
        Icon storage icon = icons[iconId];
        require(msg.sender == icon.seller, "Not seller");
        icon.active = active;
    }
}
