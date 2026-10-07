import React from 'react';
import { CloudAccount } from '../../types';
import { PROVIDER_LOGOS } from '../../assets/providerLogos';

/** The provider's logo. Providers without a logo image get the old coloured dot. */
export const ProviderIcon: React.FC<{ account: CloudAccount }> = ({ account }) => {
  const logo = PROVIDER_LOGOS[account.provider];
  if (!logo) {
    return <div className={`w-2 h-2 rounded-full bg-gradient-to-tr ${account.avatarColor} shrink-0`} />;
  }
  return (
    <div className="w-4 h-4 shrink-0 flex items-center justify-center">
      <img src={logo} alt={account.provider} className="w-4 h-4 object-contain" />
    </div>
  );
};
