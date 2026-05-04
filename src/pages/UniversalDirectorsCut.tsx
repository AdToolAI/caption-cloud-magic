import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const UniversalDirectorsCut = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    navigate(`/directors-cut${location.search}`, { replace: true });
  }, [navigate, location.search]);
  return null;
};

export default UniversalDirectorsCut;
