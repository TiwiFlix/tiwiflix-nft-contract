import { Address, toNano } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const collectionAddressStr = args.length > 0 ? args[0] : await ui.input('Collection address');
    const collectionAddress = Address.parse(collectionAddressStr);

    const nftCollection = provider.open(NftCollection.createFromAddress(collectionAddress));

    console.log(`Checking balance for ${collectionAddress}...`);
    const balance = await nftCollection.getCollectionBalance();
    console.log(`Current Balance: ${balance} TON`);

    if (balance < 0.05) {
        console.log('Balance is too low to withdraw (min reserve ~0.02 TON + gas).');
        return;
    }

    const confirm = await ui.input(`Withdraw all funds (keeping 0.02 TON reserve)? [y/N]`);
    if (confirm.toLowerCase() !== 'y') {
        console.log('Aborted.');
        return;
    }

    console.log('Sending withdrawal request...');
    await nftCollection.sendEmergencyWithdraw(provider.sender(), {
        value: toNano('0.05'),
        queryId: Date.now()
    });

    console.log('Withdrawal transaction sent.');
}

