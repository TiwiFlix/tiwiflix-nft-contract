import { Address, toNano } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const addressStr = args.length > 0 ? args[0] : await ui.input('Collection address');
    const address = Address.parse(addressStr);
    const nftCollection = provider.open(NftCollection.createFromAddress(address));

    const collectionData = await nftCollection.getCollectionData();
    const startItemIndex = collectionData.nextItemIndex;

    console.log('---------------------------------------------------------');
    console.log('🚀 Testing Batch Minting Scenarios');
    console.log('Collection Address:', address.toString());
    console.log('Next Item Index:', startItemIndex);
    console.log('---------------------------------------------------------');

    // Unified Batch Minting Scenario
    console.log('\n[1/1] Unified Batch Minting (Multiple Users + Self)...');
    
    const myAddress = provider.sender().address as Address;
    const batchList = [
        Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'), // User 1
        Address.parse('EQD__________________________________________0vo'), // User 2
        myAddress, // Self Item 1
        myAddress, // Self Item 2
        myAddress  // Self Item 3
    ];
    
    console.log(`Sending ONE transaction to mint ${batchList.length} items...`);

    await nftCollection.sendBatchMint(provider.sender(), {
        value: toNano('0.08') * BigInt(batchList.length), // Cost coverage
        queryId: Date.now(),
        addresses: batchList,
        nextItemIndex: startItemIndex,
        nftItemAmount: toNano('0.05'),
    });
    
    console.log(`✅ Request sent for indices ${startItemIndex} - ${startItemIndex + batchList.length - 1}`);
    console.log('Check your wallet and the explorer to see all items minted in one go.');
    
    console.log('\n---------------------------------------------------------');
    console.log('🏁 Batch Test Request Sent');
    console.log('---------------------------------------------------------');
}

