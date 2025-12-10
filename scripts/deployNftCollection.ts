import { Address, toNano } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const sender_address = provider.sender().address as Address;
    
    const mintPrice = Number(toNano('0.1')); // Set the initial mint price to 0.1 TON

    // Compile and open the NFT collection
    const nftCollection = provider.open(
        NftCollection.createFromConfig(
            {
                ownerAddress: sender_address,
                nextItemIndex: 0,
                collectionContentUrl: 'https://tiwiflix.github.io/tiwiflix-nft-contract/collection.json',
                commonContentUrl: 'https://tiwiflix.github.io/tiwiflix-nft-contract',
                nftItemCode: await compile('NftItem'),
                royaltyParams: {
                    factor: 10,
                    base: 100,
                    address: sender_address,
                },
                mintPrice, // Set the mint price in the configuration
            },
            await compile('NftCollection'),
        ),
    );

    // Deploy the NFT collection
    await nftCollection.sendDeploy(provider.sender(), toNano('0.05'));

    // Wait for the contract to be deployed
    await provider.waitForDeploy(nftCollection.address);

    console.log('NFT Collection deployed at:', nftCollection.address.toString());
    
    // Generate GetGems link
    const isTestnet = provider.network() !== 'mainnet';
    const getgemsPrefix = isTestnet ? 'testnet.' : '';
    const collectionUrl = `https://${getgemsPrefix}getgems.io/collection/${nftCollection.address.toString()}`;
    
    console.log('---------------------------------------------------------');
    console.log('🚀 View your collection on GetGems:', collectionUrl);
    console.log('---------------------------------------------------------');

    // Mint 10 NFTs to the owner
    console.log('Minting 10 NFTs to owner...');
    const ownerAddress = provider.sender().address as Address;
    const mintRequests: Address[] = [];
    for (let i = 0; i < 10; i++) {
        mintRequests.push(ownerAddress);
    }

    await nftCollection.sendBatchMint(provider.sender(), {
        value: toNano('0.08') * BigInt(mintRequests.length),
        queryId: Date.now(),
        addresses: mintRequests,
        nextItemIndex: 0,
        nftItemAmount: toNano('0.05'),
    });

    console.log('Successfully sent request to mint 10 NFTs.');
}
