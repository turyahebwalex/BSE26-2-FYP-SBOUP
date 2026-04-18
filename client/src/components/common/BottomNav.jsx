import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiHome, FiSearch, FiMessageSquare, FiUser, FiBriefcase } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';

const BottomNav = () => {
  const { user } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const workerLinks = [
    { path: '/dashboard', icon: FiHome, label: 'Home' },
    { path: '/discover', icon: FiSearch, label: 'Discover' },
    { path: '/messages', icon: FiMessageSquare, label: 'Messages' },
    { path: '/profile', icon: FiUser, label: 'Profile' },
  ];

  const employerLinks = [
    { path: '/employer', icon: FiHome, label: 'Home' },
    { path: '/employer/post', icon: FiBriefcase, label: 'Post' },
    { path: '/messages', icon: FiMessageSquare, label: 'Messages' },
    { path: '/profile', icon: FiUser, label: 'Profile' },
  ];

  const links = user?.role === 'employer' ? employerLinks : workerLinks;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex justify-around items-center h-16">
        {links.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            className={`flex flex-col items-center gap-1 px-3 py-2 ${
              isActive(path) ? 'text-primary' : 'text-gray-400'
            }`}
          >
            <Icon size={22} />
            <span className="text-xs">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
