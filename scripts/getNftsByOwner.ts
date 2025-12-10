import { Address } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NftItem } from '../wrappers/NftItem';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    // 1. Get Collection Address
    const collectionAddressStr = args.length > 0 ? args[0] : await ui.input('Collection address');
    const collectionAddress = Address.parse(collectionAddressStr);
    
    // 2. Get Target Owner Address
    const ownerAddressStr = args.length > 1 ? args[1] : await ui.input('Target Owner address');
    const targetOwnerAddress = Address.parse(ownerAddressStr);

    const nftCollection = provider.open(NftCollection.createFromAddress(collectionAddress));

    console.log(`Scanning collection ${collectionAddress} for NFTs owned by ${targetOwnerAddress}...`);

    // 3. Get Collection Data to know how many items to scan
    const data = await nftCollection.getCollectionData();
    const nextItemIndex = data.nextItemIndex;
    
    console.log(`Collection has ${nextItemIndex} items.`);
    
    const ownedNfts: { index: number, address: string, content: string }[] = [];

    // 4. Iterate and check (Batching could be improved, but simple loop for now)
    // Warning: This is slow for large collections. Ideally use an Indexer API.
    for (let i = 0; i < nextItemIndex; i++) {
        try {
            const nftAddress = await nftCollection.getNftAddressByIndex(BigInt(i));
            const nftItem = provider.open(NftItem.createFromAddress(nftAddress));
            
            const nftData = await nftItem.getNftData();
            
            if (nftData.ownerAddress.equals(targetOwnerAddress)) {
                console.log(`Found NFT #${i} at ${nftAddress}`);
                ownedNfts.push({ 
                    index: i, 
                    address: nftAddress.toString(),
                    content: nftData.content 
                });
            }
            
            // Progress indicator
            if (i % 10 === 0) process.stdout.write('.');
            
        } catch (e) {
            console.warn(`Failed to fetch NFT #${i}:`, e);
        }
    }
    console.log('\nDone.');

    if (ownedNfts.length === 0) {
        console.log('No NFTs found for this address.');
    } else {
        console.log(`\nFound ${ownedNfts.length} NFTs:`);
        
        // Output full details for better visibility/usage
        const detailedNfts = ownedNfts.map(nft => ({
            index: nft.index,
            address: nft.address,
            collectionAddress: collectionAddress.toString(),
            owner: targetOwnerAddress.toString(),
            content: nft.content,
            getGemsUrl: `https://${provider.network() !== 'mainnet' ? 'testnet.' : ''}getgems.io/collection/${collectionAddress}/${nft.address}`
        }));

        console.log(JSON.stringify(detailedNfts, null, 2));
    }
}

