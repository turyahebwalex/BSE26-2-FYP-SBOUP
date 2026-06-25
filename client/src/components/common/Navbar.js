import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiBell, FiMessageSquare, FiUser, FiLogOut } from 'react-icons/fi';

const Navbar = () => {
  const { user, logout, unreadNotificationCount, unreadMessageCount } = useAuth();

  const getDashboardLink = () => {
    if (user?.role === 'admin') return '/admin';
    if (user?.role === 'employer') return '/employer';
    return '/dashboard';
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to={getDashboardLink()} className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">Skill</span>
            <span className="text-xl font-bold text-secondary">Bridge</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {user?.role === 'skilled_worker' && (
              <>
                <Link to="/discover" className="text-gray-600 hover:text-primary transition">Discover</Link>
                <Link to="/applications" className="text-gray-600 hover:text-primary transition">Applications</Link>
                <Link to="/learning" className="text-gray-600 hover:text-primary transition">Upskill</Link>
              </>
            )}
            {user?.role === 'employer' && (
              <>
                <Link to="/employer/post" className="text-gray-600 hover:text-primary transition">Post Job</Link>
                <Link to="/employer/opportunities" className="text-gray-600 hover:text-primary transition">My Jobs</Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Notifications */}
            <Link to="/notifications" className="relative text-gray-500 hover:text-primary">
              <FiBell size={20} />
              {unreadNotificationCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              )}
            </Link>

            {/* Messages */}
            <Link to="/messages" className="relative text-gray-500 hover:text-primary">
              <FiMessageSquare size={20} />
              {unreadMessageCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </span>
              )}
            </Link>

            <Link to="/profile" className="text-gray-500 hover:text-primary">
              <FiUser size={20} />
            </Link>
            <button onClick={logout} className="text-gray-500 hover:text-red-500 transition">
              <FiLogOut size={20} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;