// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import './IERC20.sol';

/// @title Interface for WCTA
interface IWCTA is IERC20 {
    /// @notice Deposit CTA to get wrapped CTA
    function deposit() external payable;

    /// @notice Withdraw wrapped CTA to get CTA
    function withdraw(uint256) external;
}