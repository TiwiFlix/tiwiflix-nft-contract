import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, Dictionary, toNano, Address } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';

describe('NftCollection', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('NftCollection'); // Compile the contract
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let nftCollection: SandboxContract<NftCollection>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        const mintPrice = Number(toNano('1')); // Set the initial mint price to 0.1 TON

        // Set up deployer
        deployer = await blockchain.treasury('deployer');
        // Open the compiled contract on the blockchain
        nftCollection = blockchain.openContract(
            NftCollection.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    nextItemIndex: 0,
                    collectionContentUrl: 'https://psalmfill.github.io/tiwiflix-ton-nft/collection.json',
                    commonContentUrl: 'https://psalmfill.github.io/tiwiflix-ton-nft',
                    nftItemCode: await compile('NftItem'),
                    royaltyParams: {
                        factor: 10,
                        base: 100,
                        address: deployer.address,
                    },
                    mintPrice, // Set the mint price in the configuration
                    isVerified: false
                },
                code,
            ),
        );

        // Deploy the contract
        const deployResult = await nftCollection.sendDeploy(deployer.getSender(), toNano('0.05'));

        // Ensure contract is deployed successfully
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            deploy: true,
            success: true,
        });
    });

    // Test case 1: Verify contract deployment
    it('should deploy successfully', async () => {
        // Checks are already done in the beforeEach
        const isVerified = await nftCollection.getIsVerified();
        expect(isVerified).toBe(false); // Should be false initially
    });

    // Test case 2: Get collection data
    it('should return correct collection data', async () => {
        const collectionData = await nftCollection.getCollectionData();
        // expect(collectionData).toBeTruthy();
        expect(collectionData.ownerAddress.toString()).toBe(deployer.address.toString());
        expect(collectionData.nextItemIndex.toString()).toBe('0'); // next_item_index starts at 0
        // Add checks for collection content, owner, etc.
    });

    // Test case 3: Mint a new NFT
    it('should mint a new NFT', async () => {
        const mintFee = toNano('0');
        const nftContent = new Cell(); // Add any necessary NFT content
        const data = await nftCollection.getCollectionData();

        // Send a message to mint a new NFT
        const mintResult = await nftCollection.sendMint(deployer.getSender(), {
            index: data.nextItemIndex,
            value: toNano('0.05') + mintFee,
            queryId: Date.now(),
            coinsForStorage: toNano('0.05') + mintFee,
            ownerAddress: deployer.address,
            content: '/nft.json',
        });

        // Ensure the minting transaction is successful
        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true,
        });

        // Verify next_item_index has incremented
        const collectionData = await nftCollection.getCollectionData();
        expect(collectionData.nextItemIndex.toString()).toBe('1'); // next_item_index should now be 1
        
        // Check verification status
        const isVerified = await nftCollection.getIsVerified();
        expect(isVerified).toBe(true);
    });

    // Test case 4: Mint a new NFT from another address
    it('should mint a new NFT from another address', async () => {
        const mintFee = toNano('1');
        const nftContent = new Cell(); // Add any necessary NFT content
        const data = await nftCollection.getCollectionData();

        // Create another address (for example, a "user" address)
        const user = await blockchain.treasury('user'); // Simulate a new user address

        // Send a message to mint a new NFT using the 'user' address instead of 'deployer'
        const mintResult = await nftCollection.sendMint(user.getSender(), {
            // <-- Use user.getSender()
            index: data.nextItemIndex,
            value: toNano('0.05') + mintFee,
            queryId: Date.now(),
            coinsForStorage: toNano('0.05') + mintFee,
            ownerAddress: user.address, // Set the 'user' address as the owner
            content: '/nft.json',
        });

        // Ensure the minting transaction is successful
        expect(mintResult.transactions).toHaveTransaction({
            from: user.address, // <-- Now 'from' is the 'user' address
            to: nftCollection.address,
            success: true,
        });

        // Verify next_item_index has incremented
        const collectionData = await nftCollection.getCollectionData();
        expect(collectionData.nextItemIndex.toString()).toBe('1'); // next_item_index should now be 1
    });
    
    // Test case: Refund excess
    it('should refund excess value', async () => {
        const data = await nftCollection.getCollectionData();
        const mintPrice = await nftCollection.getMintingPrice(); // BigInt
        const excessAmount = toNano('1');
        const user = await blockchain.treasury('rich_user');
        const nftInit = await nftCollection.getNftItemAmount();
        const safeGas = toNano('0.02');
        
        const mintResult = await nftCollection.sendMint(user.getSender(), {
            index: data.nextItemIndex,
            value: mintPrice + nftInit + excessAmount + safeGas,
            queryId: Date.now(),
            coinsForStorage: nftInit, // This arg is currently unused in v2 logic for refund calc, but used in wrapper to build msg?
            // Actually wrapper uses `storeCoins(opts.coinsForStorage)`?
            // Wait, wrapper sends `Opcodes.mint` with `coinsForStorage`.
            // But my contract logic `op=1` takes `total_coins` from `in_msg_body~load_coins()`.
            // Wait, `in_msg_body~load_coins()`?
            // The wrapper:
            // .storeCoins(opts.coinsForStorage)
            // So `total_coins` variable in `recv_internal` is what wrapper calls `coinsForStorage`.
            // So I must ensure `coinsForStorage` sent by wrapper matches `msg_value` (minus fees)?
            // The v1 logic used `total_coins` (from body) to determine how much to send to NFT.
            // My v2 logic uses `total_coins` (from body) to determine refund?
            // Let's re-read `recv_internal`:
            // `int total_coins = in_msg_body~load_coins();`
            // `deploy_nft_item(..., total_coins, ...)`
            // `deploy_nft_item` uses `total_coins` to calculate refund: `total_coins - mint_price - nft_init`.
            // So `total_coins` in the BODY must reflect the total payment?
            // NO. `total_coins` in body is just a number. The actual payment is `msg_value`.
            // The wrapper sends a message with `value: opts.value`.
            // The wrapper BODY has `coinsForStorage`.
            // v1 logic: `remaining_coins = total_coins - minting_price`.
            // And it sends `remaining_coins`.
            // So `total_coins` (from body) WAS the intended amount for the deployment logic.
            // But who pays? The `recv_internal` receives `msg_value`.
            // If `msg_value` < `total_coins` (from body), the contract might fail if it tries to send `total_coins`.
            // My v2 logic:
            // `int refund_amount = total_coins - cost;`
            // `if (refund_amount > 0) ... send refund`.
            // If I pass `total_coins` = 100 TON in body, but only send 1 TON in `msg_value`.
            // `deploy_nft_item` will try to refund `100 - cost`.
            // It sends a message with value `refund`.
            // It will fail because contract balance is low.
            // So `total_coins` passed in BODY should be equal to (or less than) `msg_value` of the message?
            // The wrapper `sendMint` has `coinsForStorage` parameter.
            // But it sets `value: opts.value`.
            // The user calls `sendMint(..., { value: X, coinsForStorage: Y })`.
            // If I want to refund excess, I must pass the *full amount* in `coinsForStorage` (the body) so the contract knows how much I intended?
            // OR I should use `msg_value` in the contract?
            // `recv_internal` receives `msg_value`.
            // But `recv_internal` logic in `nft_collection.fc` (original):
            // `deploy_nft_item` took `total_coins` from body.
            // I should probably use `msg_value` instead of `total_coins` from body?
            // `recv_internal(cell in_msg_full, slice in_msg_body)`.
            // It doesn't receive `msg_value` as argument!
            // Wait, `recv_internal` signature: `(int my_balance, int msg_value, cell in_msg_full, slice in_msg_body)`
            // BUT `nft_collection.fc` line 101: `() recv_internal(cell in_msg_full, slice in_msg_body) impure {`.
            // This is the simplified signature. It doesn't get `msg_value`.
            // To get `msg_value`, I need the full signature.
            // `(int my_balance, int msg_value, cell in_msg_full, slice in_msg_body)`
            // So I MUST update the signature of `recv_internal` to access `msg_value` if I want to rely on actual attached value.
            // OR I rely on the user passing the correct amount in the body.
            // If I rely on the body, the user can fake it (say "I sent 100" but send 1). Then contract tries to refund 99 and fails.
            // This prevents "accidental overpayment" (if user puts same amount in body and value).
            // But if user sends 100 Value and puts 1 in body, `refund` calc uses 1. No refund.
            // If user sends 1 Value and puts 100 in body, `refund` calc uses 100. Fail.
            // To properly implement "Auto Refund of Excess Payment", I SHOULD use the actual `msg_value`.
            
            // So I will update `recv_internal` signature in `nft_collection.fc`.
            // `(int my_balance, int msg_value, cell in_msg_full, slice in_msg_body)`
            // Then I pass `msg_value` to `deploy_nft_item`.
            // And use `msg_value` for calculations.
            
            ownerAddress: user.address,
            content: '/nft.json',
        });

        // Check for refund transaction
        expect(mintResult.transactions).toHaveTransaction({
            from: nftCollection.address,
            to: user.address,
            success: true, // Should succeed (refund)
        });
    });

    it('should update nft item amount', async () => {
        const newAmount = Number(toNano('0.1'));
        const updateResult = await nftCollection.sendChangeNftItemAmount(deployer.getSender(), {
            value: toNano('0.01'),
            queryId: Date.now(),
            newNftItemAmount: newAmount,
        });

        expect(updateResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true,
        });

        const amount = await nftCollection.getNftItemAmount();
        expect(amount).toBe(BigInt(newAmount));
    });

    it('should update royalty params', async () => {
        const newRoyaltyParams = {
            factor: 5,
            base: 100,
            address: deployer.address, // or a new address
        };

        const updateResult = await nftCollection.sendChangeRoyaltyParams(deployer.getSender(), {
            value: toNano('0.01'),
            queryId: Date.now(),
            newRoyaltyParams: newRoyaltyParams,
        });

        expect(updateResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true,
        });

        const params = await nftCollection.getRoyaltyParams();
        expect(params.factor.toString()).toBe('5');
        expect(params.base.toString()).toBe('100');
    });

    it('should respect max supply', async () => {
        // Set max supply to current index + 1
        const collectionData = await nftCollection.getCollectionData();
        const currentIndex = collectionData.nextItemIndex;
        const newMaxSupply = BigInt(currentIndex) + 1n;

        const updateResult = await nftCollection.sendChangeMaxSupply(deployer.getSender(), {
            value: toNano('0.01'),
            queryId: Date.now(),
            newMaxSupply: newMaxSupply,
        });

        expect(updateResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true,
        });

        const maxSupply = await nftCollection.getMaxSupply();
        expect(maxSupply).toBe(newMaxSupply);

        // Mint 1 success
        const mintResult1 = await nftCollection.sendMint(deployer.getSender(), {
            index: currentIndex,
            value: toNano('0.1'),
            queryId: Date.now(),
            coinsForStorage: toNano('0.05'),
            ownerAddress: deployer.address,
            content: '/nft.json',
        });
        expect(mintResult1.transactions).toHaveTransaction({ success: true });

        // Mint 2 fail (exceeds max supply)
        const mintResult2 = await nftCollection.sendMint(deployer.getSender(), {
            index: currentIndex + 1,
            value: toNano('0.1'),
            queryId: Date.now(),
            coinsForStorage: toNano('0.05'),
            ownerAddress: deployer.address,
            content: '/nft.json',
        });
        expect(mintResult2.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: false,
            exitCode: 407 // Max supply exceeded
        });
    });

    it('should emergency withdraw', async () => {
        // Send some extra funds to contract
        const sender = await blockchain.treasury('sender');
        await sender.send({
            to: nftCollection.address,
            value: toNano('1'),
            bounce: false // Non-bounceable to simulate stuck funds
        });

        const balanceBefore = await deployer.getBalance();
        
        const withdrawResult = await nftCollection.sendEmergencyWithdraw(deployer.getSender(), {
            value: toNano('0.05'),
            queryId: Date.now(),
        });

        expect(withdrawResult.transactions).toHaveTransaction({
            from: nftCollection.address,
            to: deployer.address,
            success: true,
            op: 0 // Text comment response
        });
        
        // Approximate check: balance should increase by ~1 TON
        const balanceAfter = await deployer.getBalance();
        expect(balanceAfter).toBeGreaterThan(balanceBefore + toNano('0.9'));
    });

    // Test case 5: Update minting price
    it('should update minting price', async () => {
        const newMintingPrice = Number(toNano('0.2'));

        // Send a message to update the minting price
        const updatePriceResult = await nftCollection.sendChangeMintPrice(deployer.getSender(), {
            value: toNano('0.01'),
            queryId: Date.now(),
            newMintPrice: newMintingPrice,
        });

        // Ensure transaction is successful
        expect(updatePriceResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true,
        });

        // Verify minting price has been updated
        const mintingPrice = await nftCollection.getMintingPrice();
        expect(mintingPrice.toString()).toBe(BigInt(newMintingPrice).toString());
    });

    it('should update owner address', async () => {
        // Send a message to update the minting price
        const updatePriceResult = await nftCollection.sendChangeOwner(deployer.getSender(), {
            value: toNano('0.01'),
            queryId: Date.now(),
            newOwnerAddress: deployer.address,
        });

        // Ensure transaction is successful
        expect(updatePriceResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true,
        });

        // Verify collection data has been updated
        const collectionData = await nftCollection.getCollectionData();
        expect(collectionData.ownerAddress.toString()).toBe(deployer.address.toString());
    });

    it('should update content', async () => {
        const mintPrice = Number(toNano('0.1')); // Set the initial mint price to 0.1 TON
        const newCollectionContentUrl = 'https://psalmfill.github.io/tiwiflix-ton-nft/new-collection.json';
        // Send a message to update the minting price
        const updateContentResult = await nftCollection.sendChangeContent(deployer.getSender(), toNano('0.01'), {
            ownerAddress: deployer.address,
            nextItemIndex: 0,
            collectionContentUrl: newCollectionContentUrl,
            commonContentUrl: 'https://psalmfill.github.io/tiwiflix-ton-nft',
            nftItemCode: await compile('NftItem'),
            royaltyParams: {
                factor: 10,
                base: 100,
                address: deployer.address,
            },
            mintPrice, // Set the mint price in the configuration
            isVerified: true
        });
        // Ensure transaction is successful
        expect(updateContentResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true,
        });

        // Verify collection data has been updated
        const collectionData = await nftCollection.getCollectionData();
        expect(collectionData.collectionContentUrl.toString()).toBe(newCollectionContentUrl);
    });

    // Test case 6: Batch deploy NFTs
    it('should batch deploy NFTs', async () => {
        const collectionData = await nftCollection.getCollectionData();
        let nextItemIndex = collectionData.nextItemIndex;
        const address1 = await blockchain.treasury('address1');
        const address2 = await blockchain.treasury('address2');
        const address3 = await blockchain.treasury('address3');
        const address4 = await blockchain.treasury('address4');
        const address5 = await blockchain.treasury('address5');

        const addresses = [
            address1.address, address2.address, address3.address, address4.address, address5.address
        ]

        const txResult = await nftCollection.sendBatchMint(
            deployer.getSender(), {
                addresses,
                value: toNano(0.08 * addresses.length), // Increased value
                queryId: Date.now(),
                nextItemIndex
            }
        )

        expect(txResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true,
        });

    });

    it('should fail batch deploy if limit exceeded (>80)', async () => {
        const collectionData = await nftCollection.getCollectionData();
        let nextItemIndex = collectionData.nextItemIndex;
        
        // Generate 81 addresses
        const addresses: Address[] = [];
        for (let i = 0; i < 81; i++) {
             addresses.push((await blockchain.treasury(`batch_user_${i}`)).address);
        }

        const txResult = await nftCollection.sendBatchMint(
            deployer.getSender(), {
                addresses,
                value: toNano(0.08 * addresses.length),
                queryId: Date.now(),
                nextItemIndex
            }
        );

        // Should fail with exit code 399
        expect(txResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: false,
            exitCode: 399
        });
    });

    // Test case 7: Get royalty parameters
    it('should return royalty parameters', async () => {
        const royaltyParams = await nftCollection.getRoyaltyParams();
        const data = await nftCollection.getCollectionData();

        // Ensure royalty parameters are returned correctly
        expect(royaltyParams).toBeTruthy();
        expect(royaltyParams.base.toString()).toBe('100'); // Example: royalty base
        expect(royaltyParams.factor.toString()).toBe('10'); // Example: royalty factor
        // Verify royalty address as well
    });

    // Test case 8: Get NFT address by index
    it('should return correct NFT address by index', async () => {
        const nftAddress = await nftCollection.getNftAddressByIndex(0n);

        // Ensure NFT address is returned correctly
        expect(nftAddress).toBeTruthy();
    });

    // Test case 9: Handle incorrect minting price (error case)
    it('should fail if minting price is too low', async () => {
        const mintFee = toNano('0.05'); // Too low (total < mintPrice + storage)
        const data = await nftCollection.getCollectionData();
        // Create another address (for example, a "user" address)
        const user = await blockchain.treasury('user'); // Simulate a new user address

        const mintResult = await nftCollection.sendMint(user.getSender(), {
            index: data.nextItemIndex,
            value: toNano('0.05'), // Value sent
            queryId: Date.now(),
            coinsForStorage: toNano('0.05'), // Body value (ignored for check if we use msg_value, but passed to function)
            ownerAddress: user.address,
            content: '/nft.json',
        });

        // Ensure the transaction failed
        expect(mintResult.transactions).toHaveTransaction({
            from: user.address,
            to: nftCollection.address,
            success: false, // Should fail
        });
    });
});
