// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ProtectionBook} from "../src/ProtectionBook.sol";

/// A tiny ERC-20, placed at Arc's USDC address for the tests.
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount; // reverts when the allowance is too small
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ProtectionBookTest is Test {
    MockUSDC constant usdc = MockUSDC(0x3600000000000000000000000000000000000000);
    ProtectionBook book;
    address treasury = address(0x7EA);
    address buyer = address(0xA6E);
    string constant SYMBOL = "test:demo";
    bytes32 constant REF = keccak256("order-1");
    uint256 constant PREMIUM = 4_830_000; // 4.83 USDC

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

    function setUp() public {
        vm.etch(address(usdc), address(new MockUSDC()).code);
        vm.prank(treasury);
        book = new ProtectionBook();
        usdc.mint(buyer, 18_000_000);
    }

    // (a) a buy moves the premium from buyer to treasury and emits the event with id 1
    function test_BuyMovesPremiumAndEmits() public {
        vm.prank(buyer);
        usdc.approve(address(book), PREMIUM);

        vm.expectEmit(true, true, true, true, address(book));
        emit ProtectionBought(1, keccak256(bytes(SYMBOL)), SYMBOL, buyer, 1, 7, PREMIUM, REF);
        vm.prank(buyer);
        book.buyProtection(SYMBOL, 1, 7, PREMIUM, REF);

        assertEq(usdc.balanceOf(buyer), 18_000_000 - PREMIUM);
        assertEq(usdc.balanceOf(treasury), PREMIUM);
        assertEq(book.purchases(), 1);
        assertEq(book.treasury(), treasury);
    }

    // (b) a buy without allowance reverts
    function test_BuyWithoutAllowanceReverts() public {
        vm.prank(buyer);
        vm.expectRevert();
        book.buyProtection(SYMBOL, 1, 7, PREMIUM, REF);

        assertEq(usdc.balanceOf(buyer), 18_000_000);
        assertEq(book.purchases(), 0);
    }
}
