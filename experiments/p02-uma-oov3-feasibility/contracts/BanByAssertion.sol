// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Minimal subset of UMA OptimisticOracleV3Interface used by the consumer (signatures copied from UMA's
/// OptimisticOracleV3Interface.sol).
interface IOptimisticOracleV3 {
    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        address currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external returns (bytes32);
    function defaultIdentifier() external view returns (bytes32);
}

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// Demo consumer: a claimant asserts "photo P of device D is fake". If UMA resolves the assertion as truthful,
/// the device is banned and the claimant receives a reward from this contract's pool.
contract BanByAssertion {
    IOptimisticOracleV3 public immutable oo;
    IERC20 public immutable currency;
    uint256 public immutable bond;
    uint256 public immutable reward;
    uint64 public immutable liveness;

    struct Claim { bytes32 photoHash; address device; address claimant; bool resolved; }
    mapping(bytes32 => Claim) public claims; // assertionId => claim
    mapping(address => bool) public banned;

    event ClaimMade(bytes32 indexed assertionId, bytes32 photoHash, address indexed device, address indexed claimant);
    event ClaimDisputed(bytes32 indexed assertionId);
    event ClaimResolved(bytes32 indexed assertionId, bool truthful, address device);

    constructor(address _oo, address _currency, uint256 _bond, uint256 _reward, uint64 _liveness) {
        oo = IOptimisticOracleV3(_oo);
        currency = IERC20(_currency);
        bond = _bond;
        reward = _reward;
        liveness = _liveness;
    }

    function claimFake(bytes32 photoHash, address device) external returns (bytes32 assertionId) {
        require(!banned[device], "already banned");
        require(currency.transferFrom(msg.sender, address(this), bond), "bond pull failed");
        require(currency.approve(address(oo), bond), "approve failed");
        bytes memory claim = abi.encodePacked(
            "Photo 0x", _hex(abi.encodePacked(photoHash)),
            " attested by device 0x", _hex(abi.encodePacked(device)),
            " is not a genuine camera capture"
        );
        // asserter = claimant, so UMA returns the bond (or the dispute winnings) directly to the claimant.
        assertionId = oo.assertTruth(
            claim, msg.sender, address(this), address(0), liveness, address(currency), bond,
            oo.defaultIdentifier(), bytes32(0)
        );
        claims[assertionId] = Claim(photoHash, device, msg.sender, false);
        emit ClaimMade(assertionId, photoHash, device, msg.sender);
    }

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        require(msg.sender == address(oo), "only OO");
        Claim storage c = claims[assertionId];
        c.resolved = true;
        if (assertedTruthfully) {
            banned[c.device] = true;
            currency.transfer(c.claimant, reward); // best effort; pool may be empty
        }
        emit ClaimResolved(assertionId, assertedTruthfully, c.device);
    }

    function assertionDisputedCallback(bytes32 assertionId) external {
        require(msg.sender == address(oo), "only OO");
        emit ClaimDisputed(assertionId);
    }

    function _hex(bytes memory b) internal pure returns (bytes memory s) {
        bytes16 h = "0123456789abcdef";
        s = new bytes(b.length * 2);
        for (uint256 i = 0; i < b.length; i++) {
            s[2 * i] = h[uint8(b[i]) >> 4];
            s[2 * i + 1] = h[uint8(b[i]) & 0x0f];
        }
    }
}
