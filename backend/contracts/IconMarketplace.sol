// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract IconMarketplace {
    struct Icon {
        uint256 id;
        string name;
        uint256 price;
        address payable seller;
        string iconURL;
        bool sold;
    }

    mapping(uint256 => Icon) public icons;
    mapping(uint256 => address) public iconBuyers;
    uint256 public iconCount;

    event IconAdded(
        uint256 indexed id,
        string name,
        uint256 price,
        address indexed seller,
        string iconURL
    );

    event IconPurchased(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 price
    );

    function addIcon(
        string memory name,
        uint256 price,
        string memory iconURL
    ) external {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(price > 0, "Price must be greater than zero");
        require(bytes(iconURL).length > 0, "Icon URL cannot be empty");

        uint256 iconId = iconCount;
        icons[iconId] = Icon({
            id: iconId,
            name: name,
            price: price,
            seller: payable(msg.sender),
            iconURL: iconURL,
            sold: false
        });

        iconCount += 1;
        emit IconAdded(iconId, name, price, msg.sender, iconURL);
    }

    function buyIcon(uint256 iconId) external payable {
        require(iconId < iconCount, "Icon does not exist");

        Icon storage icon = icons[iconId];
        require(!icon.sold, "Icon already sold");
        require(msg.sender != icon.seller, "Cannot buy your own icon");
        require(msg.value == icon.price, "Incorrect ETH amount");

        icon.sold = true;
        iconBuyers[iconId] = msg.sender;
        icon.seller.transfer(msg.value);

        emit IconPurchased(iconId, msg.sender, icon.seller, icon.price);
    }

    function getDownloadURL(uint256 iconId) external view returns (string memory) {
        require(iconId < iconCount, "Icon does not exist");
        Icon memory icon = icons[iconId];
        require(icon.sold, "Icon not sold");
        require(iconBuyers[iconId] == msg.sender, "Not buyer");

        return icon.iconURL;
    }
}
