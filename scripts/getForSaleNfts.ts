import { Address, fromNano } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NftItem } from '../wrappers/NftItem';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const collectionAddressStr = args.length > 0 ? args[0] : await ui.input('Collection address');
    const collectionAddress = Address.parse(collectionAddressStr);

    const nftCollection = provider.open(NftCollection.createFromAddress(collectionAddress));

    console.log(`Scanning collection ${collectionAddress} for active sales...`);

    const data = await nftCollection.getCollectionData();
    const nextItemIndex = data.nextItemIndex;
    
    console.log(`Collection has ${nextItemIndex} items.`);
    
    const forSaleNfts: any[] = [];

    // Iterate through all items
    for (let i = 0; i < nextItemIndex; i++) {
        try {
            const nftAddress = await nftCollection.getNftAddressByIndex(BigInt(i));
            const nftItem = provider.open(NftItem.createFromAddress(nftAddress));
            
            const nftData = await nftItem.getNftData();
            const ownerAddress = nftData.ownerAddress;

            // Check if the owner is a Sale Contract
            // We do this by attempting to call 'get_sale_data' on the owner address
            try {
                // Use the provider to open a generic connection to the owner address
                // and attempt to call the getter method
                const saleProvider = provider.provider(ownerAddress);
                const result = await saleProvider.get('get_sale_data', []);
                
                // If we get here, it IS a sale contract (GetGems standard)
                // get_sale_data returns: (magic, is_complete, created_at, marketplace_address, nft_address, nft_owner_address, full_price, ...)
                
                const reader = result.stack;
                reader.readNumber(); // magic
                const isComplete = reader.readBoolean();
                reader.readNumber(); // created_at
                reader.readAddress(); // marketplace
                reader.readAddress(); // nft_address
                const originalOwner = reader.readAddress();
                const fullPrice = reader.readBigNumber();

                if (!isComplete) {
                    console.log(`\nFound Sale: NFT #${i} for ${fromNano(fullPrice)} TON`);
                    forSaleNfts.push({
                        index: i,
                        nftAddress: nftAddress.toString(),
                        saleContract: ownerAddress.toString(),
                        originalOwner: originalOwner.toString(),
                        price: fromNano(fullPrice) + ' TON',
                        priceRaw: fullPrice.toString()
                    });
                }

            } catch (e) {
                // If runMethod fails, it's likely a regular user wallet (not a sale contract)
                // or a contract that doesn't support get_sale_data
                // process.stdout.write('.');
            }
            
            if (i % 10 === 0) process.stdout.write('.');
            
        } catch (e) {
            console.warn(`\nError checking NFT #${i}:`, e);
        }
    }

    console.log('\n\n--- Scan Complete ---');
    if (forSaleNfts.length === 0) {
        console.log('No active sales found.');
    } else {
        console.log(JSON.stringify(forSaleNfts, null, 2));
    }
}

