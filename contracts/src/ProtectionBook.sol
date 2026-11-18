// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// The agent's protection purchases. Each buy moves the USDC premium from the buyer
/// to the treasury and leaves an event. No budget or approval yet: Phase 11.
contract ProtectionBook {
    /// Arc's USDC. 6 decimals through the ERC-20 interface.
    IERC20 public constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    /// Where premiums go: the deployer.
    address public immutable treasury;

    /// How many purchases have been made. Also the id of the latest one.
    uint256 public purchases;

    /// side: 0 = YES, 1 = NO. premium is in USDC base units (6 decimals).
    /// marketId = keccak256(bytes(symbol)), the same as OddsFeed.
    event ProtectionBought(
        uint256 indexed id,
        bytes32 indexed marketId,
        string symbol,
        address indexed buyer,
        uint8 side,
        uint32 contracts,
        uint256 premium,
        bytes32 orderRef
    );

    constructor() {
        treasury = msg.sender;
    }

    /// The buyer must first approve this contract for `premium` USDC.
    /// No budget or approval yet: Phase 11.
    function buyProtection(string calldata symbol, uint8 side, uint32 contracts, uint256 premium, bytes32 orderRef)
        external
    {
        require(USDC.transferFrom(msg.sender, treasury, premium));
        purchases++;
        emit ProtectionBought(purchases, keccak256(bytes(symbol)), symbol, msg.sender, side, contracts, premium, orderRef);
    }
}
