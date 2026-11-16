// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Proves the deploy, write and read path on Arc testnet.
contract Hello {
    string public message;

    event Ping(address indexed from, string message);

    function ping(string calldata m) external {
        message = m;
        emit Ping(msg.sender, m);
    }
}
