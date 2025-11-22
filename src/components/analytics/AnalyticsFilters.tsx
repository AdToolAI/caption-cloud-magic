import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Filter, X } from 'lucide-react';

export interface AnalyticsFilterState {
  planTypes: string[];
  signupMethods: string[];
  userStatus: string[];
}

interface Props {
  filters: AnalyticsFilterState;
  onFilterChange: (filters: AnalyticsFilterState) => void;
}

const PLAN_TYPES = ['free', 'pro', 'enterprise'];
const SIGNUP_METHODS = ['email', 'google', 'github', 'social'];
const USER_STATUS = ['active', 'churned', 'new'];

export function AnalyticsFilters({ filters, onFilterChange }: Props) {
  const hasActiveFilters = 
    filters.planTypes.length > 0 || 
    filters.signupMethods.length > 0 || 
    filters.userStatus.length > 0;

  const toggleFilter = (category: keyof AnalyticsFilterState, value: string) => {
    const current = filters[category];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    
    onFilterChange({
      ...filters,
      [category]: updated
    });
  };

  const clearFilters = () => {
    onFilterChange({
      planTypes: [],
      signupMethods: [],
      userStatus: []
    });
  };

  const getActiveFilterCount = () => {
    return filters.planTypes.length + filters.signupMethods.length + filters.userStatus.length;
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1">
              {getActiveFilterCount()}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Plan Type Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                Plan Type
                {filters.planTypes.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {filters.planTypes.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Plan Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {PLAN_TYPES.map(plan => (
                <DropdownMenuCheckboxItem
                  key={plan}
                  checked={filters.planTypes.includes(plan)}
                  onCheckedChange={() => toggleFilter('planTypes', plan)}
                >
                  {plan.charAt(0).toUpperCase() + plan.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Signup Method Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                Signup Method
                {filters.signupMethods.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {filters.signupMethods.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Signup Method</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SIGNUP_METHODS.map(method => (
                <DropdownMenuCheckboxItem
                  key={method}
                  checked={filters.signupMethods.includes(method)}
                  onCheckedChange={() => toggleFilter('signupMethods', method)}
                >
                  {method.charAt(0).toUpperCase() + method.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                User Status
                {filters.userStatus.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {filters.userStatus.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>User Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {USER_STATUS.map(status => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={filters.userStatus.includes(status)}
                  onCheckedChange={() => toggleFilter('userStatus', status)}
                >
                  {status === 'new' ? 'New (< 7 days)' : status.charAt(0).toUpperCase() + status.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap gap-2">
          {filters.planTypes.map(plan => (
            <Badge key={`plan-${plan}`} variant="secondary" className="gap-1">
              Plan: {plan.charAt(0).toUpperCase() + plan.slice(1)}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => toggleFilter('planTypes', plan)}
              />
            </Badge>
          ))}
          {filters.signupMethods.map(method => (
            <Badge key={`method-${method}`} variant="secondary" className="gap-1">
              Method: {method.charAt(0).toUpperCase() + method.slice(1)}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => toggleFilter('signupMethods', method)}
              />
            </Badge>
          ))}
          {filters.userStatus.map(status => (
            <Badge key={`status-${status}`} variant="secondary" className="gap-1">
              Status: {status === 'new' ? 'New' : status.charAt(0).toUpperCase() + status.slice(1)}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => toggleFilter('userStatus', status)}
              />
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
