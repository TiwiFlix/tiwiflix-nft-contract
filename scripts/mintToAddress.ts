import { Address, toNano, fromNano } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const addressStr = args.length > 0 ? args[0] : await ui.input('Collection address');
    const address = Address.parse(addressStr);
    const nftCollection = provider.open(NftCollection.createFromAddress(address));

    console.log('---------------------------------------------------------');
    console.log('🎁 Minting Single NFT to Target Address');
    console.log('Collection:', address.toString());
    console.log('---------------------------------------------------------');

    // 1. Get Target Address
    const targetAddressStr = args.length > 1 ? args[1] : await ui.input('Enter Recipient Address');
    const targetAddress = Address.parse(targetAddressStr);

    // 2. Fetch Data
    const collectionData = await nftCollection.getCollectionData();
    const mintPrice = await nftCollection.getMintingPrice();
    const nftItemAmount = await nftCollection.getNftItemAmount(); // Dynamic storage cost
    const gasSafety = toNano('0.02');

    console.log(`\nMinting NFT #${collectionData.nextItemIndex} to ${targetAddress.toString()}`);
    console.log(`Cost breakdown:`);
    console.log(`- Mint Price (to Owner): ${fromNano(mintPrice)} TON`);
    console.log(`- Storage (to Item):     ${fromNano(nftItemAmount)} TON`);
    console.log(`- Gas Safety:            ${fromNano(gasSafety)} TON`);
    
    // Determine Value to Send
    // If Sender == Owner, they technically pay the mintPrice to themselves (minus gas), 
    // but the contract logic demands the value be present.
    // If Sender != Owner, they pay the full price.
    const totalValue = mintPrice + nftItemAmount + gasSafety;
    
    await nftCollection.sendMint(provider.sender(), {
        index: collectionData.nextItemIndex,
        value: totalValue + toNano('0.05'), // Add buffer for forwarding
        queryId: Date.now(),
        coinsForStorage: nftItemAmount, 
        ownerAddress: targetAddress, // <-- This is where we set the recipient
        content: '/nft.json',
    });

    console.log('✅ Transaction sent.');
    
    // Generate GetGems link for the specific NFT
    const nftAddress = await nftCollection.getNftAddressByIndex(BigInt(collectionData.nextItemIndex));
    const isTestnet = provider.network() !== 'mainnet';
    const getgemsPrefix = isTestnet ? 'testnet.' : '';
    const nftUrl = `https://${getgemsPrefix}getgems.io/collection/${address.toString()}/${nftAddress.toString()}`;
    
    console.log('---------------------------------------------------------');
    console.log('🚀 View the new NFT on GetGems:', nftUrl);
    console.log('---------------------------------------------------------');
}

