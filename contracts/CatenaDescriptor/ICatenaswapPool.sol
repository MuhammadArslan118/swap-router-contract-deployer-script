// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './ICatenaswapPoolImmutables.sol';
import './ICatenaswapPoolState.sol';
import './ICatenaswapPoolDerivedState.sol';
import './ICatenaswapPoolActions.sol';
import './ICatenaswapPoolOwnerActions.sol';
import './ICatenaswapPoolEvents.sol'; 

/// @title The interface for a Catena Swap Pool
/// @notice A Catena Swap pool facilitates swapping and automated market making between any two assets that strictly conform
/// to the ERC20 specification
/// @dev The pool interface is broken up into many smaller pieces
interface ICatenaswapPool is
    ICatenaswapPoolImmutables,
    ICatenaswapPoolState,
    ICatenaswapPoolDerivedState,
    ICatenaswapPoolActions,
    ICatenaswapPoolOwnerActions,
    ICatenaswapPoolEvents
{

}
