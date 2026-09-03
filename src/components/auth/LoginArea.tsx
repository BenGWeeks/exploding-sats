// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useState } from 'react';
import { User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import LoginDialog from './LoginDialog';
import SignupDialog from './SignupDialog';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { AccountSwitcher } from './AccountSwitcher';
import { cn } from '@/lib/utils';

export interface LoginAreaProps {
  className?: string;
  isMobile?: boolean;
  onDialogOpen?: () => void;
}

export function LoginArea({ className, isMobile = false, onDialogOpen }: LoginAreaProps) {
  const { currentUser } = useLoggedInAccounts();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [signupDialogOpen, setSignupDialogOpen] = useState(false);

  const handleLogin = () => {
    setLoginDialogOpen(false);
    setSignupDialogOpen(false);
  };

  const openLoginDialog = () => {
    onDialogOpen?.();
    setLoginDialogOpen(true);
  };

  const openSignupDialog = () => {
    onDialogOpen?.();
    setSignupDialogOpen(true);
  };

  return (
    <div className={cn("inline-flex items-center justify-center", className)}>
      {currentUser ? (
        <AccountSwitcher onAddAccountClick={openLoginDialog} />
      ) : (
        <div className={`flex justify-center ${isMobile ? 'gap-1' : 'gap-2'}`}>
          <Button
            onClick={openLoginDialog}
            variant="outline"
            className={`border-green-500 text-green-500 hover:bg-green-500 hover:text-black ${isMobile ? 'h-6 px-2 text-xs' : 'h-9 px-3'}`}
          >
            <User className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-4 w-4'} />
            LOGIN
          </Button>
          <Button
            onClick={openSignupDialog}
            variant="outline"
            className={`border-green-500 text-green-500 hover:bg-green-500 hover:text-black ${isMobile ? 'h-6 px-2 text-xs' : 'h-9 px-3'}`}
          >
            <UserPlus className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-4 w-4'} />
            SIGNUP
          </Button>
        </div>
      )}

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
        onSignup={() => setSignupDialogOpen(true)}
      />

      <SignupDialog
        isOpen={signupDialogOpen}
        onClose={() => setSignupDialogOpen(false)}
      />
    </div>
  );
}